<script setup lang="ts">
import { toast } from '~/components/ui/sonner'
import {
  ArrowLeftIcon,
  DownloadIcon,
  FileTextIcon,
  ListChecksIcon,
  Loader2Icon,
  MessagesSquareIcon,
  PencilIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
  XIcon,
  FileIcon,
  FileUpIcon,
  BookOpenIcon,
  EyeIcon,
  SearchIcon,
} from '@lucide/vue'
import { authHeaders } from '~/lib/http'
import { useCaseStore, type LegalCase, type CaseIntake, type CaseConversation } from '~/stores/cases'
import { useTodoStore } from '~/stores/todos'
import { useAuthStore } from '~/stores/auth'
import { upgradeMessage } from '~/stores/billing'
import { useDocumentExport } from '~/composables/useDocumentExport'
import DocumentViewer from '~/components/DocumentViewer.vue'
import CaseIntakeForm, { type CaseIntakePayload, type IntakeTemplateOption } from '~/components/CaseIntakeForm.vue'
import TemplatePicker, { type TemplateOption } from '~/components/TemplatePicker.vue'
import TaskPanel from '~/components/TaskPanel.vue'
import CitationPanel from '~/components/CitationPanel.vue'
import IntakeFormSheet, { type IntakeField } from '~/components/IntakeFormSheet.vue'
import ChatThread from '~/components/chat/ChatThread.vue'
import ChatComposer from '~/components/chat/ChatComposer.vue'
import ChatEmptyState from '~/components/chat/ChatEmptyState.vue'
import ChatScrollToBottom from '~/components/chat/ChatScrollToBottom.vue'
import ChatSearchBar from '~/components/chat/ChatSearchBar.vue'

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

// The case summary expands inline above the thread, not in the rail, so it
// stays independent of the panel choice.
const showSummary = ref(true)

const threads = ref<CaseConversation[]>([])
const activeConversationId = ref<string | null>(null)
const creatingThread = ref(false)
const newThreadPurpose = ref('')
const creating = ref(false)
const quickPurposes = ['Draft a letter', 'Legal research', 'Summarize facts']

const messages = ref<Message[]>([])
const input = ref('')
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
const searchBarRef = ref<InstanceType<typeof ChatSearchBar> | null>(null)

const activeAssistantMessage = computed<Message | null>(() => {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    const m = messages.value[i]
    if (m && m.role === 'assistant' && m.sources.length > 0) return m
  }
  return null
})

const hasCitations = computed(() => activeAssistantMessage.value !== null)

interface CaseDocument {
  id: string
  case_id: string | null
  title: string
  original_filename: string
  mime_type: string
  status: 'queued' | 'processing' | 'ready' | 'failed'
  error_message: string | null
  chunk_count: number
  created_at: string
}

const caseDocuments = ref<CaseDocument[]>([])
const documentsLoading = ref(false)
const uploadingDocument = ref(false)
const caseFileInput = ref<HTMLInputElement | null>(null)
const documentsError = ref('')
const caseFileDrop = useFileDrop()
const viewingDocument = ref<CaseDocument | null>(null)
let documentPollTimer: ReturnType<typeof setInterval> | null = null

interface GeneratedDocument {
  id: string
  conversation_id: string
  conversation_title: string | null
  title: string
  content: string
  created_at: string
}

const generatedDocuments = ref<GeneratedDocument[]>([])
const generatedLoading = ref(false)
const exporting = ref<string | null>(null)

const documentStatusStyles: Record<CaseDocument['status'], string> = {
  queued: 'bg-muted text-muted-foreground',
  processing: 'bg-peach/60 text-espresso dark:bg-cream/10 dark:text-peach',
  ready: 'bg-forest/10 text-forest dark:bg-cream/10 dark:text-peach',
  failed: 'bg-destructive/10 text-destructive',
}

const documentStatusLabel: Record<CaseDocument['status'], string> = {
  queued: 'Queued',
  processing: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
}

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

function onCaseFileSelected(event: Event) {
  const target = event.target as HTMLInputElement
  const files = target.files ? Array.from(target.files) : []
  target.value = ''
  if (files.length === 0) return
  void uploadCaseDocuments(files)
}

function onCaseFilesDropped(event: DragEvent) {
  const rejected = caseFileDrop.onDrop(event, (files) => {
    void uploadCaseDocuments(files)
  })

  if (rejected.length > 0) {
    documentsError.value = `"${rejected[0]?.name}" is not a supported file type. Use PDF, DOCX, TXT, MD, or an image.`
  }
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

const { previewDoc, previewWidth, startResize, openExport, closePreview } = useDocumentExport()

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

const statusStyles: Record<string, string> = {
  open: 'bg-forest/10 text-forest dark:bg-cream/10 dark:text-peach',
  in_progress: 'bg-peach/60 text-espresso dark:bg-cream/10 dark:text-peach',
  on_hold: 'bg-espresso/10 text-espresso dark:bg-cream/10 dark:text-peach',
  closed: 'bg-muted text-muted-foreground',
}

const priorityStyles: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-espresso/10 text-espresso dark:bg-cream/10 dark:text-peach',
  high: 'bg-destructive/10 text-destructive dark:bg-cream/10 dark:text-destructive',
  urgent: 'bg-destructive/15 text-destructive dark:bg-cream/10 dark:text-destructive',
}

const typeLabels: Record<string, string> = {
  legal: 'Legal',
  hr: 'HR',
  customer_support: 'Customer Support',
  administrative: 'Administrative',
  general: 'General',
}

const statusLabel: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  closed: 'Closed',
}

const statusLabelFor = computed(() => (value: string) => statusLabel[value] ?? value)

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatDate(value: string | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(value: string | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

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

async function createThread(purpose?: string) {
  const value = (purpose ?? newThreadPurpose.value).trim()
  if (!value || !caseDetail.value || creating.value) return
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
  if (!question || sending.value || !conversationId.value) return

  messageStartIndex = messages.value.length
  lastQuestion.value = question
  sending.value = true
  streamError.value = ''
  currentStatus.value = null
  currentStatusLabel.value = null
  input.value = ''
  todoToolCalled.value = false
  resetSteps()

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
      body: JSON.stringify({ message: question }),
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
  }
}

function searchNavigate(messageId: string) {
  searchActiveId.value = messageId
  nextTick(() => {
    document.getElementById(`msg-${messageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
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

async function handleEditSubmit(payload: CaseIntakePayload) {
  try {
    await caseStore.updateCase(String(route.params.id), payload)
    editOpen.value = false
    toast.success('Case updated')
    await load()
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not update the case')
  }
}

function handleEditCancel() {
  editOpen.value = false
}

async function draftLetter(template: TemplateOption) {
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

watch(messages, async () => {
  if (messages.value.length === 0) return
  await nextTick()
  scrollToBottom()
}, { deep: true })

onMounted(async () => {
  await Promise.all([load(), loadTemplates()])
})

onBeforeUnmount(() => {
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
    <aside v-if="caseDetail && !loading" class="hidden w-64 shrink-0 flex-col overflow-hidden border-r bg-muted/20 md:flex">
      <div class="flex h-full min-h-0 flex-col p-3">
        <div class="flex items-center justify-between px-1">
          <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Threads</p>
          <Button
            variant="ghost"
            size="sm"
            class="size-7 p-0"
            :disabled="creating"
            aria-label="New thread"
            @click="creatingThread = !creatingThread"
          >
            <PlusIcon class="size-4" />
          </Button>
        </div>

        <div v-if="creatingThread" class="mt-2 space-y-2 rounded-lg border bg-background p-2 shadow-sm">
          <Input
            v-model="newThreadPurpose"
            class="h-8 text-xs"
            placeholder="Purpose, e.g. Draft a letter"
            :disabled="creating"
            @keydown.enter="createThread()"
          />
          <div class="flex flex-wrap gap-1">
            <Button
              v-for="purpose in quickPurposes"
              :key="purpose"
              variant="outline"
              size="sm"
              class="h-6 px-2 text-[11px]"
              :disabled="creating"
              @click="createThread(purpose)"
            >
              {{ purpose }}
            </Button>
          </div>
          <div class="flex items-center justify-end gap-1">
            <Button variant="ghost" size="sm" class="h-6 text-[11px]" :disabled="creating" @click="cancelCreateThread">
              Cancel
            </Button>
            <Button size="sm" class="h-6 text-[11px]" :disabled="creating || !newThreadPurpose.trim()" @click="createThread()">
              <Loader2Icon v-if="creating" class="size-3 animate-spin" />
              Create
            </Button>
          </div>
        </div>

        <nav class="mt-2 max-h-[35dvh] min-h-0 space-y-1 overflow-y-auto pr-1">
          <button
            v-for="thread in threads"
            :key="thread.id"
            class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors"
            :class="thread.id === activeConversationId ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'"
            @click="selectConversation(thread.id)"
          >
            <MessagesSquareIcon class="size-3.5 shrink-0" />
            <span class="min-w-0 flex-1 truncate font-medium">{{ thread.purpose || thread.title || 'Untitled' }}</span>
            <span v-if="thread.messages_count > 0" class="text-[10px] text-muted-foreground">{{ thread.messages_count }}</span>
          </button>
        </nav>

        <div class="mt-4 flex min-h-0 flex-col rounded-lg border-t pt-3">
          <div class="flex items-center justify-between px-1">
            <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Generated</p>
            <NuxtLink to="/generated-documents" class="px-1 text-[10px] font-medium text-primary hover:underline">
              View all
            </NuxtLink>
          </div>

          <div class="mt-1.5 min-h-0 max-h-[22dvh] space-y-1.5 overflow-y-auto pr-1">
            <div v-if="generatedLoading && generatedDocuments.length === 0" class="px-1 py-1 text-[11px] text-muted-foreground">
              Loading…
            </div>
            <div v-else-if="generatedDocuments.length === 0" class="px-1 py-1 text-[11px] text-muted-foreground">
              No drafts exported yet. Draft a letter, then export it from the chat.
            </div>

            <div
              v-for="doc in generatedDocuments"
              :key="doc.id"
              class="rounded-lg border bg-background px-2 py-1.5"
            >
              <p class="truncate text-[11px] font-medium">{{ doc.title }}</p>
              <p class="mt-0.5 text-[10px] text-muted-foreground">{{ formatDate(doc.created_at) }}</p>
              <div class="mt-1.5 flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  class="h-6 flex-1 gap-1 px-1.5 text-[10px]"
                  :disabled="exporting !== null"
                  @click="downloadGenerated(doc, 'word')"
                >
                  <Loader2Icon v-if="exporting === `${doc.id}:word`" class="size-2.5 animate-spin" />
                  <DownloadIcon v-else class="size-2.5" />
                  Word
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="h-6 flex-1 gap-1 px-1.5 text-[10px]"
                  :disabled="exporting !== null"
                  @click="downloadGenerated(doc, 'pdf')"
                >
                  <Loader2Icon v-if="exporting === `${doc.id}:pdf`" class="size-2.5 animate-spin" />
                  <DownloadIcon v-else class="size-2.5" />
                  PDF
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div
          class="mt-4 flex min-h-0 flex-1 flex-col rounded-lg border-t pt-3 transition-colors"
          :class="caseFileDrop.dragging.value ? 'rounded-lg border-primary bg-primary/5' : ''"
          @dragenter="caseFileDrop.onDragEnter"
          @dragover="caseFileDrop.onDragOver"
          @dragleave="caseFileDrop.onDragLeave"
          @drop="onCaseFilesDropped"
        >
          <div class="flex items-center justify-between px-1">
            <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documents</p>
            <Button
              variant="ghost"
              size="sm"
              class="size-7 p-0"
              :disabled="uploadingDocument"
              aria-label="Upload document"
              @click="caseFileInput?.click()"
            >
              <Loader2Icon v-if="uploadingDocument" class="size-4 animate-spin" />
              <FileUpIcon v-else class="size-4" />
            </Button>
            <input
              ref="caseFileInput"
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md,.jpg,.jpeg,.png,.webp,.gif,.tiff,.heic"
              class="hidden"
              @change="onCaseFileSelected"
            />
          </div>

          <p class="px-1 pt-1 text-[10px] leading-tight text-muted-foreground">
            PDF, DOCX, TXT, MD, or image (OCR) — drag files here or upload, attached to this case for retrieval.
          </p>

          <div class="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            <div v-if="documentsLoading && caseDocuments.length === 0" class="px-1 py-1 text-[11px] text-muted-foreground">
              Loading documents…
            </div>
            <div v-else-if="caseDocuments.length === 0" class="px-1 py-1 text-[11px] text-muted-foreground">
              No documents yet.
            </div>

            <div
              v-for="doc in caseDocuments"
              :key="doc.id"
              class="group flex items-center gap-1.5 rounded-lg border bg-background px-2 py-1.5"
            >
              <div class="flex min-w-0 flex-1 items-center gap-2">
                <FileIcon class="size-3.5 shrink-0 text-muted-foreground" />
                <div class="min-w-0">
                  <p class="truncate text-[11px] font-medium">{{ doc.title }}</p>
                  <p class="mt-0.5 flex items-center gap-1 truncate text-[10px] text-muted-foreground">
                    <span
                      class="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[9px] font-medium"
                      :class="documentStatusStyles[doc.status]"
                    >
                      <Loader2Icon
                        v-if="doc.status === 'queued' || doc.status === 'processing'"
                        class="size-2.5 animate-spin"
                      />
                      {{ documentStatusLabel[doc.status] }}
                    </span>
                    <span v-if="doc.status === 'ready'" class="truncate">{{ doc.chunk_count }} chunks</span>
                    <span v-if="doc.status === 'failed' && doc.error_message" class="truncate">{{ doc.error_message }}</span>
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                class="size-6 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground max-lg:opacity-100"
                :aria-label="`View ${doc.title}`"
                @click="viewingDocument = doc"
              >
                <EyeIcon class="size-3.5" />
              </Button>
              <button
                type="button"
                class="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground max-lg:opacity-100"
                :aria-label="`Download ${doc.title}`"
                @click="downloadDocument(doc.id, doc.original_filename)"
              >
                <DownloadIcon class="size-3.5" />
              </button>
              <Button
                variant="ghost"
                size="icon"
                class="size-6 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive max-lg:opacity-100"
                :aria-label="`Delete ${doc.title}`"
                @click="removeCaseDocument(doc)"
              >
                <TrashIcon class="size-3.5" />
              </Button>
            </div>
          </div>

          <p v-if="documentsError" class="px-1 pt-2 text-[10px] text-destructive">{{ documentsError }}</p>
        </div>
      </div>
    </aside>

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
        <div class="border-b px-4 py-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-3">
              <Button variant="ghost" size="icon" class="size-8 shrink-0" @click="router.push('/cases')">
                <ArrowLeftIcon class="size-4" />
              </Button>
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h1 class="truncate text-base font-semibold">{{ caseDetail.title }}</h1>
                  <Badge :class="statusStyles[caseDetail.status]" class="text-[10px]">
                    {{ statusLabelFor(caseDetail.status) }}
                  </Badge>
                  <Badge v-if="caseDetail.priority" :class="priorityStyles[caseDetail.priority]" class="text-[10px]">
                    {{ caseDetail.priority }}
                  </Badge>
                </div>
                <div class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span v-if="caseDetail.reference">{{ caseDetail.reference }}</span>
                  <span>{{ typeLabels[caseDetail.case_type] ?? humanize(caseDetail.case_type) }}</span>
                  <span v-if="caseDetail.due_date">Due {{ formatDate(caseDetail.due_date) }}</span>
                  <span v-if="caseDetail.archived_at">Archived {{ formatDate(caseDetail.archived_at) }}</span>
                </div>
              </div>
            </div>

            <div class="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
              <Button
                variant="ghost"
                size="sm"
                class="gap-1.5 px-2 text-xs sm:px-3"
                :class="{ 'text-primary': searchOpen }"
                @click="toggleSearch"
              >
                <SearchIcon class="size-4" />
                <span class="hidden sm:inline">{{ searchOpen ? 'Close search' : 'Search' }}</span>
              </Button>
              <Button v-if="!caseDetail.archived_at" variant="outline" size="sm" class="gap-1.5 px-2 text-xs sm:px-3" @click="openEdit">
                <PencilIcon class="size-3.5" />
                <span class="hidden sm:inline">Edit</span>
              </Button>
              <Button v-if="!caseDetail.archived_at" size="sm" class="gap-1.5 px-2 text-xs sm:px-3" @click="pickerOpen = true">
                <FileTextIcon class="size-3.5" />
                <span class="hidden sm:inline">Draft a letter</span>
              </Button>
              <Button
                v-if="activeAssistantMessage"
                variant="ghost"
                size="sm"
                class="gap-1.5 px-2 text-xs sm:px-3"
                :class="{ 'bg-muted text-primary': showCitations }"
                :aria-pressed="showCitations"
                @click="togglePanel('citations')"
              >
                <BookOpenIcon class="size-4" />
                <span class="hidden sm:inline">{{ showCitations ? 'Hide citations' : 'Citations' }}</span>
                <Badge v-if="activeAssistantMessage.sources.length > 0" variant="secondary" class="px-1.5 text-[10px]">
                  {{ activeAssistantMessage.sources.length }}
                </Badge>
              </Button>
              <Button
                v-if="caseDetail.description"
                variant="ghost"
                size="sm"
                class="gap-1.5 px-2 text-xs sm:px-3"
                :class="{ 'bg-muted text-primary': showSummary }"
                :aria-pressed="showSummary"
                @click="showSummary = !showSummary"
              >
                <EyeIcon class="size-4" />
                <span class="hidden sm:inline">{{ showSummary ? 'Hide summary' : 'Summary' }}</span>
              </Button>
              <Button
                v-if="conversationId"
                variant="ghost"
                size="sm"
                class="gap-1.5 px-2 text-xs sm:px-3"
                :class="{ 'bg-muted text-primary': showTasks }"
                :aria-pressed="showTasks"
                @click="togglePanel('tasks')"
              >
                <ListChecksIcon class="size-4" />
                <span class="hidden sm:inline">{{ showTasks ? 'Hide tasks' : 'Tasks' }}</span>
                <Badge v-if="conversationId && todoStore.todos.some((t) => t.conversation_id === conversationId)" variant="secondary" class="px-1.5 text-[10px]">
                  {{ todoStore.todos.filter((t) => t.conversation_id === conversationId && t.status !== 'completed').length }}
                </Badge>
              </Button>
              <Button v-if="!caseDetail.archived_at" variant="ghost" size="sm" class="gap-1.5 px-2 text-xs text-muted-foreground sm:px-3" @click="archiveCase">
                <TrashIcon class="size-3.5" />
                <span class="hidden sm:inline">Archive</span>
              </Button>
              <Button v-else variant="ghost" size="sm" class="gap-1.5 px-2 text-xs sm:px-3" @click="restoreCase">
                <PlusIcon class="size-3.5" />
                <span class="hidden sm:inline">Restore</span>
              </Button>
            </div>
          </div>

          <div v-if="showSummary && (caseDetail.description || caseDetail.related_parties?.length || caseDetail.tags?.length)" class="mt-3 border-t pt-3">
            <p v-if="caseDetail.description" class="text-xs leading-relaxed text-muted-foreground line-clamp-2">
              {{ caseDetail.description }}
            </p>
            <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span v-if="caseDetail.related_parties?.length" class="text-[11px] text-muted-foreground">
                <span class="font-medium">Parties:</span>
                {{ caseDetail.related_parties.join(' · ') }}
              </span>
              <div v-if="caseDetail.tags?.length" class="flex flex-wrap items-center gap-1">
                <Badge v-for="tag in caseDetail.tags" :key="tag" variant="secondary" class="text-[10px]">
                  {{ tag }}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div class="md:hidden flex items-center gap-1.5 overflow-x-auto border-b px-3 py-2">
          <button
            v-for="thread in threads"
            :key="thread.id"
            class="shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors"
            :class="thread.id === activeConversationId ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'"
            @click="selectConversation(thread.id)"
          >
            {{ thread.purpose || thread.title || 'Untitled' }}
          </button>
          <Button variant="ghost" size="sm" class="h-6 shrink-0 px-2 text-[11px]" :disabled="creating" @click="creatingThread = !creatingThread">
            <PlusIcon class="size-3.5" />
            New
          </Button>
        </div>

        <div v-if="creatingThread && caseDetail" class="space-y-2 border-b bg-muted/20 p-3 md:hidden">
          <Input
            v-model="newThreadPurpose"
            class="h-8 text-xs"
            placeholder="Purpose, e.g. Draft a letter"
            :disabled="creating"
            @keydown.enter="createThread()"
          />
          <div class="flex flex-wrap gap-1">
            <Button
              v-for="purpose in quickPurposes"
              :key="purpose"
              variant="outline"
              size="sm"
              class="h-6 px-2 text-[11px]"
              :disabled="creating"
              @click="createThread(purpose)"
            >
              {{ purpose }}
            </Button>
            <Button size="sm" class="ml-auto h-6 text-[11px]" :disabled="creating || !newThreadPurpose.trim()" @click="createThread()">
              <Loader2Icon v-if="creating" class="size-3 animate-spin" />
              Create
            </Button>
          </div>
        </div>

        <div class="relative min-h-0 flex-1">
          <div ref="messagesContainer" class="absolute inset-0 overflow-y-auto">
          <ChatEmptyState
            v-if="messages.length === 0"
            title="Work on this case"
            description="Ask about the law, draft correspondence, or summarize case facts. You can also pick a template to draft a letter."
            eyebrow="Batayan AI"
          >
            <Button variant="outline" class="justify-start gap-2 text-left" @click="pickerOpen = true">
              <FileTextIcon class="size-4 text-primary" />
              <span class="text-xs">Draft a letter from a template</span>
            </Button>
            <Button variant="outline" class="justify-start gap-2 text-left" @click="input = 'Summarize the key facts and deadlines of this case.'">
              <SparklesIcon class="size-4 text-primary" />
              <span class="text-xs">Summarize this case</span>
            </Button>
          </ChatEmptyState>

          <ChatThread
            v-else
            :messages="messages"
            :streaming="streaming"
            :status-label="statusLabelNow"
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
            :experience-level="experienceLevel"
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
          <ChatSearchBar :messages="messages" @query="searchQuery = $event" @navigate="searchNavigate" @close="toggleSearch" />
        </div>

        <div class="border-t p-3">
          <ChatComposer
            v-model="input"
            :disabled="busy"
            :streaming="streaming"
            :can-send="conversationId !== null"
            placeholder="Ask about this case, draft a letter, or summarize the facts…"
            @send="send()"
            @stop="stopStreaming"
          />
          <p v-if="!conversationId" class="mx-auto mt-1 max-w-3xl text-center text-[11px] text-muted-foreground">
            This case has no conversation thread yet.
          </p>
        </div>
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

    <TaskPanel
      v-if="showTasks && conversationId"
      :conversation-id="conversationId"
      @close="rightPanel = null"
    />

    <DocumentViewer v-if="viewingDocument" :document="viewingDocument" @close="viewingDocument = null" />

    <CitationPanel
      v-if="hasCitations && showCitations"
      :message="activeAssistantMessage"
      :active-citation="activeCitation"
      @close="rightPanel = null"
    />

    <CaseIntakeForm
      v-if="editOpen"
      :initial="initialForEdit()"
      :templates="templates"
      submit-label="Save Changes"
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

