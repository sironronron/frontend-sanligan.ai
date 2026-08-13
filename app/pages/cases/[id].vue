<script setup lang="ts">
import { toast } from '~/components/ui/sonner'
import {
  ArchiveIcon,
  ArrowLeftIcon,
  BookOpenIcon,
  DownloadIcon,
  FileTextIcon,
  ListChecksIcon,
  Loader2Icon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from '@lucide/vue'
import { authHeaders } from '~/lib/http'
import { useCaseStore, type LegalCase, type CaseConversation } from '~/stores/cases'
import { useTodoStore } from '~/stores/todos'
import { useLabelStore } from '~/stores/labels'
import { useAuthStore } from '~/stores/auth'
import { upgradeMessage } from '~/stores/billing'
import { useDocumentExport } from '~/composables/useDocumentExport'
import DocumentViewer from '~/components/DocumentViewer.vue'
import CaseIntakeForm, { type CaseIntakePayload } from '~/components/CaseIntakeForm.vue'
import TemplatePicker, { type TemplateOption } from '~/components/TemplatePicker.vue'
import TaskPanel from '~/components/TaskPanel.vue'
import CitationPanel from '~/components/CitationPanel.vue'
import IntakeFormSheet, { type IntakeField } from '~/components/IntakeFormSheet.vue'
import ChatThread from '~/components/chat/ChatThread.vue'
import ChatComposer from '~/components/chat/ChatComposer.vue'
import ChatEmptyState from '~/components/chat/ChatEmptyState.vue'
import ChatPromptSuggestions from '~/components/chat/ChatPromptSuggestions.vue'
import { useStarterSuggestions, type SuggestionContext } from '~/composables/useChatSuggestions'
import ChatScrollToBottom from '~/components/chat/ChatScrollToBottom.vue'
import ChatSearchBar from '~/components/chat/ChatSearchBar.vue'
import CaseProgressView from '~/components/CaseProgressView.vue'
import type { PanelToggle } from '~/components/CaseDetailHeader.vue'
import type { ChatMessageAttachment } from '~/types/chat'
import type { CaseDocument, GeneratedDocument } from '~/types/case'
import { THREAD_ICONS, threadPurposeKind } from '~/lib/threads'

definePageMeta({
  middleware: ['auth', 'organization'],
})

interface Source {
  type: 'legal' | 'document' | 'web'
  index?: number
  id?: string
  chunk_index?: number
  document_id?: string
  label?: string | null
  law_name?: string | null
  gr_number?: string | null
  promulgation_date?: string | null
  source_name?: string | null
  url?: string | null
  title?: string | null
  excerpt?: string
  content?: string
  domain?: string | null
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  provider?: string | null
  sources: Source[]
  attachments?: ChatMessageAttachment[]
  feedback?: string | null
  template_id?: string | null
  created_at: string
}

const api = useApi()
const route = useRoute()
const router = useRouter()
const {
  public: { apiBase },
} = useRuntimeConfig()

const caseStore = useCaseStore()
const todoStore = useTodoStore()
const labelStore = useLabelStore()
const auth = useAuthStore()

const experienceLevel = computed(() => auth.user?.kyc_experience_level ?? null)
const { downloadExport } = useDocumentExport()
const { download: downloadDocument } = useDocumentFile()

const caseDetail = ref<LegalCase | null>(null)
const loading = ref(true)
const notFound = ref(false)
const editOpen = ref(false)
const pickerOpen = ref(false)
const templates = ref<TemplateOption[]>([])
/**
 * One right-rail panel at a time. Tasks and citations both defaulted to open
 * and the resizable document preview opened alongside them, so on a laptop the
 * thread was squeezed between three columns.
 */
type RightPanel = 'citations' | 'tasks'

const rightPanel = ref<RightPanel | null>('tasks')

const showTasks = computed(() => rightPanel.value === 'tasks')

function togglePanel(panel: RightPanel) {
  rightPanel.value = rightPanel.value === panel ? null : panel
}

/**
 * Chat and progress are two ways of looking at the same case, so the choice
 * lives in the URL (`?view=progress`) — it survives a reload, it can be linked
 * to from the case list, and the back button returns to the thread.
 */
const view = computed<'chat' | 'progress'>(() => (route.query.view === 'progress' ? 'progress' : 'chat'))

function setView(next: 'chat' | 'progress') {
  if (view.value === next) return
  const query = { ...route.query }
  if (next === 'progress') query.view = 'progress'
  else delete query.view
  void router.replace({ query })
}

const threads = ref<CaseConversation[]>([])
const activeConversationId = ref<string | null>(null)
const creatingThread = ref(false)
const newThreadPurpose = ref('')
const creating = ref(false)
const quickPurposes = ['Draft a letter', 'Legal research', 'Summarize facts']

const messages = ref<Message[]>([])
const input = ref('')
const composerRef = ref<InstanceType<typeof ChatComposer> | null>(null)
const streaming = ref(false)
const sending = ref(false)
const streamError = ref('')
const streamController = ref<AbortController | null>(null)
// Reveals queued deltas character by character; rebuilt per send().
let textStreamer: TextStreamer | null = null
const currentStatus = ref<string | null>(null)
const currentStatusLabel = ref<string | null>(null)
const intakeFields = ref<IntakeField[] | null>(null)
const intakeDefaults = ref<Record<string, string> | null>(null)
const awaitingIntake = ref(false)
const intakeDismissed = ref(false)
const todoToolCalled = ref(false)
const messagesContainer = ref<HTMLElement | null>(null)
const lastQuestion = ref('')
let messageStartIndex = -1

const showCitations = computed(() => rightPanel.value === 'citations')
const activeCitation = ref<{ kind: string; index?: number; token?: string } | null>(null)
const ratingBusy = ref<string | null>(null)

const searchOpen = ref(false)
const searchQuery = ref('')
const searchActiveId = ref<string | null>(null)
const searchActiveOccurrence = ref(0)
const searchBarRef = ref<InstanceType<typeof ChatSearchBar> | null>(null)

const activeAssistantMessage = computed<Message | null>(() => {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    const m = messages.value[i]
    if (m && m.role === 'assistant' && m.sources.length > 0) return m
  }
  return null
})

const hasCitations = computed(() => activeAssistantMessage.value !== null)

const caseDocuments = ref<CaseDocument[]>([])
const documentsLoading = ref(false)
const uploadingDocument = ref(false)
const documentsError = ref('')
const viewingDocument = ref<CaseDocument | null>(null)
let documentPollTimer: ReturnType<typeof setInterval> | null = null

const generatedDocuments = ref<GeneratedDocument[]>([])
const generatedLoading = ref(false)
const exporting = ref<string | null>(null)

function hasPendingDocuments() {
  return caseDocuments.value.some((doc) => doc.status === 'queued' || doc.status === 'processing')
}

function scheduleDocumentPolling() {
  const pending = hasPendingDocuments()
  if (pending && documentPollTimer === null) {
    documentPollTimer = setInterval(pollCaseDocuments, 3000)
  } else if (!pending && documentPollTimer !== null) {
    clearInterval(documentPollTimer)
    documentPollTimer = null
  }
}

async function pollCaseDocuments() {
  if (documentsLoading.value) return
  await loadCaseDocuments()
}

async function loadCaseDocuments() {
  const caseId = caseDetail.value?.id
  if (!caseId) return
  documentsLoading.value = true
  try {
    const { data } = await api<{ data: CaseDocument[] }>(`/documents?case_id=${encodeURIComponent(caseId)}`)
    const previous = new Map(caseDocuments.value.map((doc) => [doc.id, doc.status]))
    caseDocuments.value = data
    for (const doc of data) {
      const prevStatus = previous.get(doc.id)
      if (!prevStatus || prevStatus === doc.status || (prevStatus !== 'queued' && prevStatus !== 'processing')) continue
      if (doc.status === 'ready') {
        toast.success(`"${doc.original_filename}" is ready to use`)
      } else if (doc.status === 'failed') {
        toast.error(`"${doc.original_filename}" could not be processed`)
      }
    }
  } catch {
    // keep the current list on transient errors
  } finally {
    documentsLoading.value = false
    scheduleDocumentPolling()
  }
}

async function loadGeneratedDocuments() {
  const caseId = caseDetail.value?.id
  if (!caseId) return
  generatedLoading.value = true
  try {
    const { data } = await api<{ data: GeneratedDocument[] }>(
      `/generated-documents?case_id=${encodeURIComponent(caseId)}`,
    )
    generatedDocuments.value = data
  } catch {
    // keep the current list on transient errors
  } finally {
    generatedLoading.value = false
  }
}

async function downloadGenerated(doc: GeneratedDocument, type: 'word' | 'pdf') {
  const key = `${doc.id}:${type}`
  if (exporting.value === key) return
  exporting.value = key
  try {
    await downloadExport(doc.content, type, doc.title)
  } catch (err: any) {
    toast.error(err?.message ?? 'Could not download the document')
  } finally {
    exporting.value = null
  }
}

async function uploadCaseDocuments(files: File[]) {
  const caseId = caseDetail.value?.id
  if (!caseId || uploadingDocument.value) return
  uploadingDocument.value = true
  documentsError.value = ''
  const failures: string[] = []
  for (const file of files) {
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('case_id', caseId)
      await api('/documents', { method: 'POST', body: form })
    } catch (err: any) {
      failures.push(err?.data?.message ?? `"${file.name}" could not be uploaded`)
    }
  }
  const succeeded = files.length - failures.length
  if (succeeded > 0) {
    toast.success(succeeded === 1 ? '1 document uploaded' : `${succeeded} documents uploaded`)
  }
  if (failures.length > 0) {
    documentsError.value = failures[0] ?? ''
  }
  uploadingDocument.value = false
  await loadCaseDocuments()
}

function reportRejectedUpload(name: string) {
  documentsError.value = `"${name}" is not a supported file type. Use PDF, DOCX, TXT, MD, or an image.`
}

async function removeCaseDocument(doc: CaseDocument) {
  try {
    await api(`/documents/${doc.id}`, { method: 'DELETE' })
    toast.success(`Deleted ${doc.original_filename}`)
    await loadCaseDocuments()
  } catch {
    toast.error('Could not delete the document')
  }
}

/** File a document under a new set of categories from the case sidebar. */
async function updateDocumentCategories(doc: CaseDocument, ids: string[]) {
  const previous = doc.categories ?? []

  doc.categories = ids
    .map((id) => labelStore.byId.get(id))
    .filter((label): label is NonNullable<typeof label> => label !== undefined)

  try {
    const { data } = await api<{ data: CaseDocument }>(`/documents/${doc.id}`, {
      method: 'PATCH',
      body: { label_ids: ids },
    })
    doc.categories = data.categories
  } catch (err: any) {
    doc.categories = previous
    toast.error(err?.data?.message ?? 'Could not update the categories')
  }
}

const { previewDoc, previewWidth, startResize, openExport, closePreview } = useDocumentExport()

/**
 * Composer attachments take the same path as the case's upload panel — POST
 * /documents with this case's id, then the usual ingestion queue — so they land
 * in the case files list and become retrievable in this case's conversations.
 */
const attachmentsState = useChatAttachments({
  caseId: () => caseDetail.value?.id ?? null,
  onUploaded: loadCaseDocuments,
})

watch(previewDoc, (doc) => {
  if (doc) rightPanel.value = null
})

const mainChatEl = ref<HTMLElement | null>(null)

// Reserve a minimum comfortable chat width so the PDF preview resize can never
// cross into the conversation area.
const CHAT_MIN_WIDTH = 400

function previewMaxWidth(): number {
  const chatWidth = mainChatEl.value?.getBoundingClientRect().width ?? 0

  // The chat section and the preview panel are flex siblings, so the chat
  // shrinks by exactly what the panel gains: only their SUM is stable while
  // dragging. Subtracting the reserve from the chat width alone made the limit
  // fall as the panel grew, so the panel was clamped back, the chat grew, the
  // limit rose, and the panel grew again — the stutter at the boundary.
  return Math.max(chatWidth + previewWidth.value - CHAT_MIN_WIDTH, MIN_PREVIEW_WIDTH)
}

const conversationId = computed(() => activeConversationId.value ?? caseDetail.value?.conversation_id ?? null)
const busy = computed(() => sending.value || streaming.value)

/**
 * What the case record knows about this matter, handed to the suggestion
 * engine so the offered steps follow the case — its subject, deadline, and the
 * tasks already drafted for this thread — instead of the last reply alone.
 */
const suggestionContext = computed<SuggestionContext>(() => ({
  caseTitle: caseDetail.value?.title ?? null,
  caseType: caseDetail.value?.case_type ?? null,
  caseDescription: caseDetail.value?.description ?? null,
  caseStatus: caseDetail.value?.status ?? null,
  casePriority: caseDetail.value?.priority ?? null,
  tags: caseDetail.value?.tags ?? [],
  relatedParties: caseDetail.value?.related_parties ?? [],
  dueDate: caseDetail.value?.due_date ?? null,
  threadPurpose: threads.value.find((t) => t.id === conversationId.value)?.purpose ?? null,
  templateName: caseDetail.value?.default_template?.name ?? null,
  openTasks: todoStore.todos
    .filter((t) => t.conversation_id === conversationId.value && t.status !== 'completed')
    .map((t) => ({ title: t.title, status: t.status, priority: t.priority, due_hint: t.due_hint })),
  role: auth.user?.kyc_role ?? null,
  useCase: auth.user?.kyc_use_case ?? null,
  documentTypes: (auth.user?.kyc_document_types ?? '').split(',').map((v) => v.trim()).filter(Boolean),
  experienceLevel: experienceLevel.value,
}))

const { starters } = useStarterSuggestions(suggestionContext)

function selectPrompt(prompt: string) {
  input.value = prompt
  composerRef.value?.focus()
}

/** Say what the assistant already knows, so the first step feels informed. */
const emptyStateDescription = computed(() => {
  const c = caseDetail.value
  if (!c) return 'Ask about the law, draft correspondence, or summarize the facts of this case.'

  const purpose = suggestionContext.value.threadPurpose
  const opening = purpose ? `This thread is for ${purpose.toLowerCase()}. ` : ''

  const known = [
    c.description ? 'the facts you recorded' : null,
    c.related_parties?.length ? 'the parties involved' : null,
    c.due_date ? `the ${formatDate(c.due_date)} deadline` : null,
  ].filter(Boolean) as string[]

  const lead = known.length > 0
    ? `Batayan already has ${known.length > 1 ? `${known.slice(0, -1).join(', ')} and ${known.at(-1)}` : known[0]}.`
    : 'Batayan works from this case record — add facts to it as you go.'

  return `${opening}${lead} Pick a first step below, or ask anything.`
})

/** Subject of the current turn, sent by the server; shown once as a heading. */
const currentTopic = ref<string | null>(null)

const statusLabels: Record<string, string> = {
  checking_sources: 'Checking legal sources',
  searching_web: 'Searching the web',
  composing: 'Composing response',
  collecting_facts: 'Collecting the facts I need',
  gathering_facts: 'Gathering the facts needed for your document',
  drafting_document: 'Drafting your document',
  preparing_next_steps: 'Preparing your next-steps checklist',
}

interface ActivityStep {
  key: string
  label: string
  state: 'done' | 'active' | 'pending'
}

const activitySteps = ref<ActivityStep[]>([])

function resetSteps() {
  activitySteps.value = []
}

function markStepActive(key: string, label: string) {
  const existing = activitySteps.value.find((step) => step.key === key)
  if (existing) {
    existing.state = 'active'
    return
  }
  activitySteps.value.push({ key, label, state: 'active' })
}

function completeStep(key: string) {
  const existing = activitySteps.value.find((step) => step.key === key)
  if (existing) {
    existing.state = 'done'
  }
}

function completeActiveSteps() {
  for (const step of activitySteps.value) {
    if (step.state === 'active') {
      step.state = 'done'
    }
  }
}

// Labels, badge styling and date formatting are shared with the case list via
// useCasePresentation; the copies that used to live here had already drifted
// from it.
const { statusLabel, formatDate } = useCasePresentation()

/** Closed cases are archived 30 days after they are closed. */
const AUTO_ARCHIVE_AFTER_DAYS = 30

const autoArchiveDate = computed(() => {
  const c = caseDetail.value
  if (!c || c.status !== 'closed' || c.archived_at) return null
  const closedAt = c.closed_at ? new Date(c.closed_at) : null
  if (!closedAt || Number.isNaN(closedAt.getTime())) return null
  closedAt.setDate(closedAt.getDate() + AUTO_ARCHIVE_AFTER_DAYS)
  return closedAt.toISOString()
})

/**
 * Closed and archived cases are read-only: the only things left are reading,
 * exporting, reopening, and archiving. Everything that creates or edits
 * content — messaging, uploads, threads, tasks, drafts, case edits — is off.
 */
const readOnly = computed(() => !!caseDetail.value?.archived_at || caseDetail.value?.status === 'closed')

async function load(conversationId?: string | null) {
  loading.value = true
  notFound.value = false
  intakeFields.value = null
  intakeDefaults.value = null
  awaitingIntake.value = false
  intakeDismissed.value = false
  try {
    const data = await caseStore.fetchCase(String(route.params.id), conversationId)
    caseDetail.value = data
    threads.value = data.conversations ?? []
    activeConversationId.value = data.active_conversation_id ?? data.conversation_id
    messages.value = (data.messages ?? []) as Message[]
    const convId = activeConversationId.value
    if (convId) {
      await todoStore.fetchTodos(convId)
    }
    await loadCaseDocuments()
    await loadGeneratedDocuments()
    await nextTick()
    scrollToBottom()
  } catch {
    notFound.value = true
  } finally {
    loading.value = false
  }
}

function cancelCreateThread() {
  creatingThread.value = false
  newThreadPurpose.value = ''
}

async function selectConversation(id: string) {
  if (id === activeConversationId.value || busy.value) return
  cancelCreateThread()
  streamError.value = ''
  await load(id)
}

/** Jumping from a line of work in the progress view back into its thread. */
async function openThreadFromProgress(id: string) {
  setView('chat')
  await selectConversation(id)
}

async function createThread(purpose?: string) {
  const value = (purpose ?? newThreadPurpose.value).trim()
  if (!value || !caseDetail.value || creating.value || readOnly.value) return
  creating.value = true
  try {
    const conversation = await caseStore.createConversation(caseDetail.value.id, { purpose: value })
    cancelCreateThread()
    await load(conversation.id)
    toast.success(`Thread created for ${value}`)
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not create the thread')
  } finally {
    creating.value = false
  }
}

async function loadTemplates() {
  try {
    const { data } = await api<{ data: TemplateOption[] }>('/templates')
    templates.value = data
  } catch {
    templates.value = []
  }
}

function handleFrame(frame: string, target: Message) {
  let event = 'message'
  const dataLines: string[] = []

  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }

  const data = dataLines.join('\n')
  if (!data) return

  let payload: Record<string, any>
  try {
    payload = JSON.parse(data)
  } catch {
    return
  }

  if (event === 'status' && typeof payload.status === 'string') {
    completeActiveSteps()
    currentStatus.value = payload.status
    currentStatusLabel.value = typeof payload.label === 'string' && payload.label !== '' ? payload.label : null
    if (typeof payload.topic === 'string' && payload.topic !== '') currentTopic.value = payload.topic
    if (payload.status === 'collecting_facts') {
      awaitingIntake.value = true
      markStepActive('collecting_facts', 'Collecting the facts I need')
    } else {
      markStepActive(payload.status, currentStatusLabel.value ?? statusLabels[payload.status] ?? payload.status)
    }
  } else if (event === 'delta' && typeof payload.delta === 'string') {
    if (textStreamer) textStreamer.push(payload.delta)
    else target.content += payload.delta
    awaitingIntake.value = false
    completeStep('composing')
  } else if (event === 'citation' && typeof payload.url === 'string') {
    const existing = target.sources.find((s) => s.type === 'web' && s.url === payload.url)
    if (!existing) {
      target.sources.push({
        type: 'web',
        index: Number.isFinite(Number(payload.index)) ? Number(payload.index) : target.sources.filter((s) => s.type === 'web').length + 1,
        label: typeof payload.title === 'string' ? payload.title : null,
        title: typeof payload.title === 'string' ? payload.title : null,
        url: payload.url,
        domain: typeof payload.domain === 'string' ? payload.domain : null,
        excerpt: typeof payload.excerpt === 'string' ? payload.excerpt : undefined,
      })
    }
  } else if (event === 'tool_call') {
    handleToolCall(payload, target)
  } else if (event === 'tool_result' && payload.name === 'create_todo') {
    todoToolCalled.value = true
    refreshTodos()
    completeStep('create_todo')
  } else if (event === 'done') {
    textStreamer?.flush()
    completeActiveSteps()
    if (intakeFields.value === null) {
      awaitingIntake.value = false
    }
  } else if (event === 'error') {
    textStreamer?.flush()
    streamError.value = String(payload.message ?? 'The AI provider could not complete the response.')
    awaitingIntake.value = false
  }
}

function handleToolCall(payload: Record<string, any>, target: Message) {
  if (payload.name === 'request_intake_form' && Array.isArray(payload.arguments?.fields)) {
    intakeFields.value = payload.arguments.fields as IntakeField[]
    intakeDefaults.value = payload.arguments.default_values ?? null
    awaitingIntake.value = true
    intakeDismissed.value = false
    completeActiveSteps()
    markStepActive('request_intake_form', 'Collecting facts from you')
    // The document is drafted only after the intake form is submitted. Drop
    // the streaming bubble so no partial draft appears before the form.
    messages.value = messages.value.filter((m) => m.id !== target.id)
  }
}

async function refreshTodos() {
  if (conversationId.value) {
    await todoStore.fetchTodos(conversationId.value)
  }
}

function extractTodoItems(text: string): Array<{ title: string; status?: string }> {
  const items: Array<{ title: string; status?: string }> = []
  const cleaned = text
    .replace(/^\s*\[\[TODO_START\]\]\s*$/gm, '')
    .replace(/^\s*\[\[TODO_END\]\]\s*$/gm, '')

  // Match various checkbox formats: "- [ ]", "- [x]", "[ ]", "[x]", "**[ ]**", "**_**"
  const regex = /^\s*[-*]*\s*(?:\*{0,2}\[_?\]\*{0,2}|\[( |x|X)\])\s+(.+)$/gm
  let match: RegExpExecArray | null
  while ((match = regex.exec(cleaned)) !== null) {
    const rawTitle = (match[2] ?? '').trim()
    const title = sanitizeTodoTitle(rawTitle)
    if (title) {
      items.push({
        title,
        status: match[1] && match[1] !== ' ' ? 'completed' : 'pending',
      })
    }
  }
  return items
}

function sanitizeTodoTitle(title: string): string {
  // Strip bold/italic markdown wrapping
  let cleaned = title.replace(/^\*{1,2}(.+?)\*{1,2}$/, '$1')
  // Strip any remaining markdown artifacts
  cleaned = cleaned.replace(/[_*`]/g, '')
  return cleaned.trim()
}

async function maybeCreateTodosFromText(text: string) {
  if (!conversationId.value || todoToolCalled.value || !text) return
  const items = extractTodoItems(text)
  if (items.length === 0) return
  try {
    await todoStore.addTodos(items, conversationId.value)
    await todoStore.fetchTodos(conversationId.value)
  } catch {
    // Non-critical: todos are a convenience, never block the chat on failure.
  }
}

function getDisplayedContent(msg: Message): string {
  return msg.content
}

async function send(questionOverride?: string | Event) {
  const question = (typeof questionOverride === 'string' ? questionOverride : input.value).trim()
  if (!question || sending.value || !conversationId.value || readOnly.value) return

  messageStartIndex = messages.value.length
  lastQuestion.value = question
  sending.value = true
  streamError.value = ''
  currentStatus.value = null
  currentStatusLabel.value = null
  input.value = ''
  // The files travel with this message; the uploads themselves stay attached
  // to the case and remain retrievable in its conversations.
  const attached = attachmentsState.take()
  todoToolCalled.value = false
  resetSteps()
  currentTopic.value = null

  if (question.startsWith('[Intake Form Submission]') || question.startsWith('[Template:')) {
    markStepActive('drafting', 'Drafting your document')
  }

  let lastAssistantText = ''

  try {
    messages.value.push({
      id: `local-${crypto.randomUUID()}`,
      role: 'user',
      content: question,
      sources: [],
      attachments: attached,
      created_at: new Date().toISOString(),
    })

    const assistant: Message = reactive({
      id: `local-${crypto.randomUUID()}`,
      role: 'assistant',
      content: '',
      sources: [],
      created_at: new Date().toISOString(),
    })
    messages.value.push(assistant)
    textStreamer = createTextStreamer((chunk) => {
      assistant.content += chunk
    })
    streaming.value = true

    await nextTick()
    scrollToBottom()

    streamController.value = new AbortController()
    const response = await fetch(`${apiBase}/api/conversations/${conversationId.value}/messages`, {
      method: 'POST',
      headers: await authHeaders({
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      }),
      body: JSON.stringify({
        message: question,
        attachment_ids: attached.map((a) => a.id),
      }),
      signal: streamController.value.signal,
    })

    if (!response.ok) {
      const errBody = await response.json().catch(() => null)
      const upgrade = upgradeMessage({ status: response.status, data: errBody })
      if (upgrade) {
        toast.error(`${upgrade}. Upgrade your plan to continue.`, {
          action: { label: 'Upgrade', onClick: () => navigateTo('/settings/billing') },
        })
      }
      throw new Error(upgrade ?? errBody?.message ?? 'The request failed')
    }

    if (!response.body) {
      throw new Error('Streaming is not supported by this browser')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''

      for (const frame of frames) {
        handleFrame(frame, assistant)
        await nextTick()
        scrollToBottom()
      }
    }

    if (buffer.trim()) {
      handleFrame(buffer, assistant)
    }

    textStreamer.flush()
    lastAssistantText = assistant.content
  } catch (err: any) {
    textStreamer?.flush()

    if (err?.name === 'AbortError') {
      streamError.value = ''
    } else {
      streamError.value = err?.message ?? 'Something went wrong while streaming the response.'
    }
  } finally {
    textStreamer = null
    streamController.value = null
    streaming.value = false
    sending.value = false
    currentStatus.value = null
    currentStatusLabel.value = null

    if (conversationId.value && caseDetail.value) {
      const data = await caseStore.fetchCase(String(route.params.id), activeConversationId.value)
      caseDetail.value = data
      threads.value = data.conversations ?? []
      if (!awaitingIntake.value) {
        messages.value = (data.messages ?? []) as Message[]
      }
      await loadGeneratedDocuments()
    }
    await maybeCreateTodosFromText(lastAssistantText)
    await refreshTodos()
    await nextTick()
    scrollToBottom()
  }
}

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

function toggleSearch() {
  searchOpen.value = !searchOpen.value
  if (!searchOpen.value) {
    searchQuery.value = ''
    searchActiveId.value = null
    searchActiveOccurrence.value = 0
  } else {
    nextTick(() => searchBarRef.value?.focusInput())
  }
}

function onGlobalKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    toggleSearch()
  }
}

function searchNavigate(match: { id: string; occurrence: number }) {
  searchActiveId.value = match.id
  searchActiveOccurrence.value = match.occurrence
  nextTick(() => {
    const root = document.getElementById(`msg-${match.id}`)
    if (!root) return
    const marks = root.querySelectorAll('mark.saligan-search-mark')
    const target = marks[match.occurrence] ?? marks[0]
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

function stopStreaming() {
  textStreamer?.flush()
  streamController.value?.abort()
  streamController.value = null
  currentStatus.value = null
  currentStatusLabel.value = null
  awaitingIntake.value = false
  streamError.value = ''
}

function handleIntakeSubmit(data: Record<string, string>) {
  intakeFields.value = null
  intakeDefaults.value = null
  awaitingIntake.value = false
  intakeDismissed.value = false
  const formatted = Object.entries(data)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')
  void send(`[Intake Form Submission]\n${formatted}`)
}

function handleIntakeCancel() {
  // Keep the pending intake fields so the user can reopen the form, but stop
  // the "waiting" bubble and surface a dismiss/fill-requirement prompt instead.
  intakeDismissed.value = true
  awaitingIntake.value = false
}

function reopenIntake() {
  intakeDismissed.value = false
  awaitingIntake.value = true
}

function abandonIntake() {
  intakeFields.value = null
  intakeDefaults.value = null
  awaitingIntake.value = false
  intakeDismissed.value = false
}

async function handleMarkdownClick(event: MouseEvent, msg: Message) {
  const target = event.target as HTMLElement
  const badge = target.closest('button[data-cite-kind]')
  if (badge) {
    const kind = badge.getAttribute('data-cite-kind')
    const token = badge.getAttribute('data-cite-token')
    const index = Number(badge.getAttribute('data-cite-index'))
    if (kind && (token !== null || Number.isFinite(index))) {
      rightPanel.value = 'citations'
      activeCitation.value = token ? { kind, token } : { kind, index }
    }
    return
  }

  const link = target.closest('a[data-export-url]')
  if (!link) return
  event.preventDefault()
  const type = (link.getAttribute('data-export-type') as 'word' | 'pdf') ?? 'word'
  const title = caseDetail.value?.title ?? (type === 'pdf' ? 'PDF Document' : 'Word Document')
  void openExport(msg.content, type, title, msg.template_id ? msg.id : undefined)
}

async function rateMessage(m: Message, feedback: 'up' | 'down') {
  if (m.id.startsWith('local-') || ratingBusy.value === m.id) return
  const rating = m.feedback === feedback ? null : feedback
  const previous = m.feedback
  m.feedback = rating
  ratingBusy.value = m.id
  try {
    if (rating) {
      await api(`/messages/${m.id}/feedback`, { method: 'POST', body: { feedback: rating } })
    } else {
      await api(`/messages/${m.id}/feedback`, { method: 'DELETE' })
    }
  } catch {
    m.feedback = previous
    toast.error('Could not save your feedback')
  } finally {
    ratingBusy.value = null
  }
}

function retryLast() {
  if (!lastQuestion.value || busy.value) return
  if (messageStartIndex >= 0) {
    messages.value.splice(messageStartIndex)
  }
  streamError.value = ''
  void send(lastQuestion.value)
}

function handleExport(m: Message, type: 'word' | 'pdf') {
  const title = caseDetail.value?.title ?? (type === 'pdf' ? 'PDF Document' : 'Word Document')
  void openExport(m.content, type, title, m.template_id ? m.id : undefined)
}

function openEdit() {
  if (readOnly.value) return
  editOpen.value = true
}

function initialForEdit(): Partial<CaseIntakePayload> | null {
  const c = caseDetail.value
  if (!c) return null
  return {
    title: c.title,
    case_type: c.case_type,
    reference: c.reference ?? '',
    priority: c.priority ?? 'medium',
    status: c.status,
    description: c.description ?? '',
    related_parties: c.related_parties?.length ? c.related_parties : [''],
    due_date: c.due_date ?? '',
    tags: c.tags ?? [],
    default_template_id: c.default_template_id ?? null,
  }
}

const statusSaving = ref(false)

/**
 * Optimistic so the badge answers immediately; the previous status is restored
 * if the write fails, since a stale badge here would misreport the matter.
 */
async function changeStatus(status: LegalCase['status']) {
  const c = caseDetail.value
  if (!c || c.status === status || statusSaving.value) return

  const previous = c.status
  c.status = status
  statusSaving.value = true
  try {
    await caseStore.updateCaseStatus(c.id, status)
    toast.success(`Status set to ${statusLabel(status)}`)
  } catch (err: any) {
    c.status = previous
    toast.error(err?.data?.message ?? 'Could not change the status')
  } finally {
    statusSaving.value = false
  }
}

const editSaving = ref(false)

async function handleEditSubmit(payload: CaseIntakePayload) {
  editSaving.value = true
  try {
    await caseStore.updateCase(String(route.params.id), payload)
    editOpen.value = false
    toast.success('Case updated')
    await load()
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not update the case')
  } finally {
    editSaving.value = false
  }
}

function handleEditCancel() {
  editOpen.value = false
}

/** Inline tag edits from the case brief are patched straight onto the case. */
async function saveCaseTags(tags: string[]) {
  const c = caseDetail.value
  if (!c || readOnly.value) return
  const previous = c.tags
  c.tags = tags
  try {
    await caseStore.updateCase(c.id, { tags })
  } catch (err: any) {
    c.tags = previous
    toast.error(err?.data?.message ?? 'Could not update the tags')
  }
}

/** Update thread tags with optimistic UI. */
async function updateThreadTags(threadId: string, ids: string[]) {
  const thread = threads.value.find((t) => t.id === threadId)
  if (!thread) return

  const previous = thread.tags ?? []
  thread.tags = ids
    .map((id) => labelStore.byId.get(id))
    .filter((tag): tag is NonNullable<typeof tag> => tag !== undefined)

  try {
    const { data } = await api<{ data: { tags?: typeof thread.tags } }>(`/conversations/${threadId}`, {
      method: 'PATCH',
      body: { label_ids: ids },
    })
    thread.tags = data.tags ?? []
  } catch {
    thread.tags = previous
    toast.error('Could not update the tags')
  }
}

async function draftLetter(template: TemplateOption) {
  if (readOnly.value) return
  pickerOpen.value = false
  await nextTick()

  const instruction = `[Template: ${template.id}]\nPlease draft a letter following the "${template.name}" template using the facts in this case. Include a clear "Next Steps" section listing what the client should do next.`
  void send(instruction)
}

async function archiveCase() {
  if (!caseDetail.value) return
  try {
    await caseStore.archiveCase(caseDetail.value.id)
    toast.success('Case archived')
    await router.push('/cases')
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not archive the case')
  }
}

async function restoreCase() {
  if (!caseDetail.value) return
  try {
    await caseStore.restoreCase(caseDetail.value.id)
    toast.success('Case restored')
    await load()
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not restore the case')
  }
}

const statusLabelNow = computed(() => {
  if (!currentStatus.value) return null
  return currentStatusLabel.value ?? statusLabels[currentStatus.value] ?? currentStatus.value
})

const openTaskCount = computed(() =>
  conversationId.value
    ? todoStore.todos.filter((t) => t.conversation_id === conversationId.value && t.status !== 'completed').length
    : 0,
)

/**
 * The side panels that can be opened over the thread. Built as data so the
 * toolbar stays one loop rather than four near-identical buttons. Summary is
 * no longer among them — the brief lives at the top of the thread now, with
 * its own disclosure, so a header toggle for it was a second control for one
 * piece of state.
 */
const panelToggles = computed(() => {
  const toggles: PanelToggle[] = [
    {
      key: 'search',
      label: 'Search',
      icon: SearchIcon,
      active: searchOpen.value,
      toggle: toggleSearch,
    },
  ]

  if (activeAssistantMessage.value) {
    toggles.push({
      key: 'citations',
      label: 'Citations',
      icon: BookOpenIcon,
      active: showCitations.value,
      count: activeAssistantMessage.value.sources.length,
      toggle: () => togglePanel('citations'),
    })
  }

  if (conversationId.value) {
    toggles.push({
      key: 'tasks',
      label: 'Tasks',
      icon: ListChecksIcon,
      active: showTasks.value,
      count: openTaskCount.value,
      toggle: () => togglePanel('tasks'),
    })
  }

  return toggles
})

watch(messages, async () => {
  if (messages.value.length === 0) return
  await nextTick()
  scrollToBottom()
}, { deep: true })

onMounted(async () => {
  window.addEventListener('keydown', onGlobalKeydown)
  await Promise.all([load(), loadTemplates()])
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  if (documentPollTimer !== null) {
    clearInterval(documentPollTimer)
    documentPollTimer = null
  }
  textStreamer?.stop()
  textStreamer = null
  streamController.value?.abort()
  streamController.value = null
})

watch(
  () => route.params.id,
  async () => {
    threads.value = []
    activeConversationId.value = null
    await load()
  },
)
</script>

<template>
  <div class="flex h-[calc(100dvh-3.5rem)] overflow-hidden">
    <CaseSidebar
      v-if="caseDetail && !loading"
      :threads="threads"
      :active-conversation-id="activeConversationId"
      :creating="creating"
      :documents="caseDocuments"
      :documents-loading="documentsLoading"
      :documents-error="documentsError"
      :uploading="uploadingDocument"
      :generated="generatedDocuments"
      :generated-loading="generatedLoading"
      :exporting="exporting"
      :readonly="readOnly"
      @select-thread="selectConversation"
      @create-thread="createThread"
      @upload="uploadCaseDocuments"
      @rejected-upload="reportRejectedUpload"
      @view-document="viewingDocument = $event"
      @download-document="downloadDocument($event.id, $event.original_filename)"
      @delete-document="removeCaseDocument"
      @update-document-categories="updateDocumentCategories"
      @download-generated="downloadGenerated"
      @update-thread-tags="updateThreadTags"
    />

    <section
      ref="mainChatEl"
      class="flex min-w-0 flex-1 flex-col"
      :class="previewDoc ? 'lg:min-w-[400px]' : ''"
    >
      <template v-if="loading">
        <div class="space-y-3 p-6">
          <Skeleton class="h-7 w-64 rounded-lg" />
          <Skeleton class="h-4 w-40 rounded-lg" />
          <Skeleton class="mt-6 h-64 w-full rounded-xl" />
        </div>
      </template>

      <template v-else-if="notFound || !caseDetail">
        <div class="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p class="text-sm font-medium">Case not found</p>
          <p class="text-xs text-muted-foreground">It may have been permanently deleted or you may not have access.</p>
          <Button variant="outline" size="sm" class="gap-1.5" @click="router.push('/cases')">
            <ArrowLeftIcon class="size-4" />
            Back to cases
          </Button>
        </div>
      </template>

      <template v-else>
        <CaseDetailHeader
          :case="caseDetail"
          :view="view"
          :status-saving="statusSaving"
          :panel-toggles="panelToggles"
          @back="router.push('/cases')"
          @set-view="setView"
          @change-status="changeStatus"
          @draft="pickerOpen = true"
          @edit="openEdit"
          @archive="archiveCase"
          @restore="restoreCase"
        />

        <div
          v-if="autoArchiveDate"
          class="flex shrink-0 items-start gap-2 border-b bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
        >
          <ArchiveIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p>
            This case is closed. It will be archived on
            <span class="font-medium text-foreground">{{ formatDate(autoArchiveDate) }}</span> if you
            don't reopen it. You can still reopen it anytime from the archived cases tab.
          </p>
        </div>

        <div v-if="view === 'progress'" class="min-h-0 flex-1 overflow-y-auto">
          <CaseProgressView :case-id="caseDetail.id" @open-thread="openThreadFromProgress" />
        </div>

        <template v-else>
        <div class="flex items-center gap-1.5 overflow-x-auto border-b px-3 py-2 md:hidden">
          <button
            v-for="thread in threads"
            :key="thread.id"
            class="flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-colors"
            :class="thread.id === activeConversationId ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'"
            @click="selectConversation(thread.id)"
          >
            <component :is="THREAD_ICONS[threadPurposeKind(thread.purpose)]" class="size-3.5" />
            {{ thread.purpose || thread.title || 'Untitled' }}
          </button>
          <Button v-if="!readOnly" variant="ghost" size="xs" class="shrink-0" :disabled="creating" @click="creatingThread = !creatingThread">
            <PlusIcon />
            New
          </Button>
        </div>

        <div v-if="creatingThread && caseDetail && !readOnly" class="space-y-2 border-b bg-muted/20 p-3 md:hidden">
          <Input
            v-model="newThreadPurpose"
            class="h-8 text-sm"
            placeholder="Purpose, e.g. Draft a letter"
            :disabled="creating"
            @keydown.enter="createThread()"
          />
          <div class="flex flex-wrap gap-1">
            <Button
              v-for="purpose in quickPurposes"
              :key="purpose"
              variant="outline"
              size="xs"
              :disabled="creating"
              @click="createThread(purpose)"
            >
              {{ purpose }}
            </Button>
            <Button size="xs" class="ml-auto" :disabled="creating || !newThreadPurpose.trim()" @click="createThread()">
              <Loader2Icon v-if="creating" class="animate-spin" />
              Create
            </Button>
          </div>
        </div>

        <CaseBrief
          v-if="caseDetail"
          :case="caseDetail"
          :editable="!readOnly"
          @edit="openEdit"
          @update-tags="saveCaseTags"
        />

        <div class="relative min-h-0 flex-1">
          <div ref="messagesContainer" class="absolute inset-0 overflow-y-auto">
          <ChatEmptyState
            v-if="messages.length === 0"
            title="Work on this case"
            :description="emptyStateDescription"
            eyebrow="Batayan AI"
          >
            <Button v-if="!readOnly" variant="outline" class="w-full justify-start gap-2 text-left" @click="pickerOpen = true">
              <FileTextIcon class="size-4 shrink-0 text-primary" />
              <span class="min-w-0 truncate text-sm">Draft a letter from a template</span>
            </Button>
          </ChatEmptyState>

          <ChatThread
            v-else
            :messages="messages"
            :streaming="streaming"
            :status-label="statusLabelNow"
            :topic="currentTopic"
            :current-status="currentStatus"
            :activity-steps="activitySteps"
            :awaiting-intake="awaitingIntake"
            :intake-dismissed="intakeDismissed"
            :has-intake-fields="intakeFields !== null"
            :last-question="lastQuestion"
            :busy="busy"
            :stream-error="streamError"
            :display-content="getDisplayedContent"
            :search-query="searchQuery"
            :active-search-id="searchActiveId"
            :active-search-occurrence="searchActiveOccurrence"
            :experience-level="experienceLevel"
            :suggestion-context="suggestionContext"
            @markdown-click="handleMarkdownClick"
            @rate="rateMessage"
            @export="handleExport"
            @retry="retryLast"
            @abandon-intake="abandonIntake"
            @reopen-intake="reopenIntake"
            @select-suggestion="(prompt) => input = prompt"
          />
          </div>

          <ChatScrollToBottom :container="messagesContainer" />
        </div>

        <div v-if="searchOpen" class="flex items-center gap-2 border-b px-3 py-2">
          <ChatSearchBar
            ref="searchBarRef"
            :messages="messages"
            @query="searchQuery = $event"
            @navigate="searchNavigate"
            @close="toggleSearch"
          />
        </div>

        <div class="border-t p-3">
          <!-- <ChatPromptSuggestions :suggestions="starters" @select="selectPrompt" /> -->
          <ChatComposer
            ref="composerRef"
            v-model="input"
            :disabled="busy"
            :readonly="readOnly"
            :streaming="streaming"
            :attachments="attachmentsState.attachments.value"
            :can-send="conversationId !== null && !attachmentsState.pending.value"
            :can-attach="caseDetail !== null && !readOnly"
            :placeholder="readOnly ? 'This case is closed — you can read it but not message it.' : 'Ask about this case, draft a letter, or summarize the facts…'"
            help-context="case"
            @send="send()"
            @stop="stopStreaming"
            @attach="attachmentsState.add"
            @remove-attachment="attachmentsState.remove"
          />
          <p v-if="!conversationId" class="mx-auto mt-1 max-w-3xl text-center text-xs text-muted-foreground">
            This case has no conversation thread yet.
          </p>
        </div>
        </template>
      </template>
    </section>

    <!-- Floating Document Preview Panel (Large Screens) -->
    <aside
      v-if="previewDoc"
      class="relative hidden lg:flex shrink-0 flex-col border-l bg-background"
      :style="{ width: `${previewWidth}px` }"
    >
      <div
        class="group absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize touch-none select-none"
        aria-hidden="true"
        @pointerdown="startResize($event, previewMaxWidth)"
      >
        <div class="mx-auto h-full w-px bg-border transition-colors group-hover:bg-primary/60" />
      </div>
      <div class="flex items-center justify-between border-b px-4 py-2.5">
        <span class="text-sm font-medium truncate">{{ previewDoc.title }}</span>
        <div class="flex items-center gap-2">
          <a
            v-if="previewDoc.blobUrl"
            :href="previewDoc.blobUrl"
            target="_blank"
            download
            class="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <DownloadIcon class="size-3.5" />
            Download
          </a>
          <Button variant="ghost" size="icon" class="size-7" @click="closePreview">
            <XIcon class="size-4" />
          </Button>
        </div>
      </div>
      <div v-if="previewDoc.loading" class="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon class="size-4 animate-spin" />
        Preparing your document…
      </div>
      <div v-else-if="previewDoc.error" class="flex flex-1 items-center justify-center px-6 text-center text-sm text-destructive">
        {{ previewDoc.error }}
      </div>
      <iframe
        v-else-if="previewDoc.type === 'pdf'"
        :src="previewDoc.blobUrl ?? undefined"
        class="flex-1 w-full border-0"
      />
      <DocxViewer
        v-else-if="previewDoc.type === 'word' && previewDoc.blobUrl"
        :blob-url="previewDoc.blobUrl"
      />
      <div v-else class="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
        <span>Word documents cannot be previewed inline.</span>
        <a
          :href="previewDoc.blobUrl ?? undefined"
          download
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <DownloadIcon class="size-3.5" />
          Download Word document
        </a>
      </div>
    </aside>

    <div
      class="grid h-full transition-[grid-template-columns] duration-200 ease-out"
      :style="{ gridTemplateColumns: showTasks && conversationId && view === 'chat' ? '1fr' : '0fr' }"
    >
      <div class="h-full min-w-0 overflow-hidden">
        <TaskPanel
          v-if="conversationId"
          :visible="showTasks && view === 'chat'"
          :conversation-id="conversationId"
          :readonly="readOnly"
          @close="rightPanel = null"
        />
      </div>
    </div>

    <DocumentViewer v-if="viewingDocument" :document="viewingDocument" @close="viewingDocument = null" />

    <div
      class="grid h-full transition-[grid-template-columns] duration-200 ease-out"
      :style="{ gridTemplateColumns: hasCitations && showCitations && view === 'chat' ? '1fr' : '0fr' }"
    >
      <div class="h-full min-w-0 overflow-hidden">
        <CitationPanel
          v-if="view === 'chat'"
          :message="activeAssistantMessage"
          :active-citation="activeCitation"
          @close="rightPanel = null"
        />
      </div>
    </div>

    <CaseIntakeForm
      v-if="editOpen"
      :initial="initialForEdit()"
      :templates="templates"
      :busy="editSaving"
      :submit-label="editSaving ? 'Saving…' : 'Save Changes'"
      @submit="handleEditSubmit"
      @cancel="handleEditCancel"
    />

    <TemplatePicker
      v-if="pickerOpen"
      :templates="templates"
      @select="draftLetter"
      @cancel="pickerOpen = false"
    />

    <IntakeFormSheet
      v-if="intakeFields && !intakeDismissed"
      :fields="intakeFields"
      :initial-values="intakeDefaults ?? {}"
      @submit="handleIntakeSubmit"
      @cancel="handleIntakeCancel"
    />

    <!-- Mobile Preview Modal -->
    <Teleport to="body">
      <div
        v-if="previewDoc"
        class="fixed inset-0 z-50 lg:hidden"
      >
        <div class="absolute inset-0 bg-black/60" @click="closePreview" />
        <div class="absolute inset-4 flex flex-col rounded-lg bg-background shadow-xl">
          <div class="flex items-center justify-between border-b px-4 py-2.5">
            <span class="text-sm font-medium truncate">{{ previewDoc.title }}</span>
            <div class="flex items-center gap-2">
              <a
                v-if="previewDoc.blobUrl"
                :href="previewDoc.blobUrl"
                target="_blank"
                download
                class="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <DownloadIcon class="size-3.5" />
                Download
              </a>
              <Button variant="ghost" size="icon" class="size-7" @click="closePreview">
                <XIcon class="size-4" />
              </Button>
            </div>
          </div>
          <div v-if="previewDoc.loading" class="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon class="size-4 animate-spin" />
            Preparing your document…
          </div>
          <div v-else-if="previewDoc.error" class="flex flex-1 items-center justify-center px-6 text-center text-sm text-destructive">
            {{ previewDoc.error }}
          </div>
<iframe
              v-else-if="previewDoc.type === 'pdf'"
              :src="previewDoc.blobUrl ?? undefined"
              class="flex-1 w-full border-0 rounded-b-lg"
            />
            <DocxViewer
              v-else-if="previewDoc.type === 'word' && previewDoc.blobUrl"
              :blob-url="previewDoc.blobUrl"
            />
            <div v-else class="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
              <span>Word documents cannot be previewed inline.</span>
              <a
                :href="previewDoc.blobUrl ?? undefined"
                download
                class="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <DownloadIcon class="size-3.5" />
                Download Word document
              </a>
            </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

