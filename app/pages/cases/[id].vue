<script setup lang="ts">
import { toast } from '~/components/ui/sonner'
import {
  ArchiveIcon,
  ArrowLeftIcon,
  DownloadIcon,
  FileTextIcon,
  ListChecksIcon,
  Loader2Icon,
  PlusIcon,
  QuoteIcon,
  SearchIcon,
  XIcon,
} from '@lucide/vue'
import { useCaseStore, type LegalCase, type CaseConversation } from '~/stores/cases'
import { useTodoStore } from '~/stores/todos'
import { extractTodoItems } from '~/utils/todos'
import { useLabelStore } from '~/stores/labels'
import { useAuthStore } from '~/stores/auth'
import { useDocumentExport } from '~/composables/useDocumentExport'
import DocumentViewer from '~/components/DocumentViewer.vue'
import CaseIntakeForm, { type CaseIntakePayload } from '~/components/CaseIntakeForm.vue'
import TemplatePicker, { type TemplateOption } from '~/components/TemplatePicker.vue'
import TaskPanel from '~/components/TaskPanel.vue'
import IntakeFormSheet from '~/components/IntakeFormSheet.vue'
import ChatThread from '~/components/chat/ChatThread.vue'
import ChatComposer from '~/components/chat/ChatComposer.vue'
import ChatEmptyState from '~/components/chat/ChatEmptyState.vue'
import ChatStarters from '~/components/chat/ChatStarters.vue'
import { useStarterSuggestions, type SuggestionContext } from '~/composables/useChatSuggestions'
import ChatScrollToBottom from '~/components/chat/ChatScrollToBottom.vue'
import ChatSearchBar from '~/components/chat/ChatSearchBar.vue'
import CitationsPanel from '~/components/chat/CitationsPanel.vue'
import CaseProgressView from '~/components/CaseProgressView.vue'
import type { PanelToggle } from '~/components/CaseDetailHeader.vue'
import type { ScheduleEvent } from '~/components/CaseMiniCalendar.vue'
import type { ChatMessage, ChatMessageAttachment } from '~/types/chat'
import { citationMarkFrom, collectCitations, findCitation, type CitationMark } from '~/utils/citations'
import type { CitationTarget } from '~/types/citations'
import type { CaseDocument, GeneratedDocument } from '~/types/case'
import { THREAD_ICONS, threadPurposeKind } from '~/lib/threads'

definePageMeta({
  middleware: ['auth', 'organization'],
})

interface Source {
  type: 'legal' | 'document' | 'web'
  index?: number
  token?: string
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
  page_id?: string | null
  has_digest?: boolean
  cited_chunk_indexes?: number[]
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
 * Everything with a day on it, gathered for the sidebar's mini calendar: the
 * case's own deadline plus every task carrying a due date. The case record's
 * task list covers every thread, and the in-session todo store overlays it so
 * tasks added or edited in the tasks panel show up without a refetch.
 */
const scheduleEvents = computed<ScheduleEvent[]>(() => {
  const c = caseDetail.value
  if (!c) return []
  const events = new Map<string, ScheduleEvent>()
  if (c.due_date) {
    events.set('case-deadline', {
      id: 'case-deadline',
      title: 'Case deadline',
      date: c.due_date.slice(0, 10),
      kind: 'deadline',
    })
  }
  for (const task of c.tasks ?? []) {
    if (!task.due_date) continue
    events.set(`task-${task.id}`, {
      id: `task-${task.id}`,
      title: task.title,
      date: task.due_date.slice(0, 10),
      kind: 'task',
      status: task.status,
    })
  }
  const conversationIds = new Set((c.conversations ?? []).map((conversation) => conversation.id))
  for (const todo of todoStore.todos) {
    if (!conversationIds.has(todo.conversation_id) || !todo.due_date) continue
    events.set(`task-${todo.id}`, {
      id: `task-${todo.id}`,
      title: todo.title,
      date: todo.due_date.slice(0, 10),
      kind: 'task',
      status: todo.status,
    })
  }
  return [...events.values()]
})

/**
 * One right-rail panel at a time. Tasks and citations both defaulted to open
 * and the resizable document preview opened alongside them, so on a laptop the
 * thread was squeezed between three columns.
 */
type RightPanel = 'tasks' | 'citations'

const rightPanel = ref<RightPanel | null>('tasks')

const showTasks = computed(() => rightPanel.value === 'tasks')
const showCitations = computed(() => rightPanel.value === 'citations')

function togglePanel(panel: RightPanel) {
  rightPanel.value = rightPanel.value === panel ? null : panel
}

/**
 * Full-screen chat: hides the case sidebar, right rail, brief and document
 * preview so the conversation fills the screen. Tied to the Fullscreen API so
 * Esc (or the header toggle) exits cleanly; the `fullscreenchange` listener
 * keeps the state in sync when the browser or the user leaves fullscreen.
 */
const fullscreen = ref(false)

function toggleFullscreen() {
  if (fullscreen.value) {
    fullscreen.value = false
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  } else {
    fullscreen.value = true
    void document.documentElement.requestFullscreen().catch(() => {})
  }
}

function onFullscreenChange() {
  fullscreen.value = !!document.fullscreenElement
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

/** What the server has for the open thread; the live turn is added on top. */
const messages = ref<Message[]>([])
const input = ref('')
const composerRef = ref<InstanceType<typeof ChatComposer> | null>(null)

const messagesContainer = ref<HTMLElement | null>(null)

const ratingBusy = ref<string | null>(null)

const searchOpen = ref(false)
const searchQuery = ref('')
const searchActiveId = ref<string | null>(null)
const searchActiveOccurrence = ref(0)
const searchBarRef = ref<InstanceType<typeof ChatSearchBar> | null>(null)

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

/**
 * The answer being generated does not belong to this page — it belongs to the
 * thread. Keeping it in the store is what lets the user move to another thread,
 * another case, or another page mid-answer, see that Batayan is still writing,
 * and come back to a finished (or still arriving) reply.
 */
const chatStream = useChatStreamStore()

const turn = computed(() => chatStream.turnFor(conversationId.value))
const streaming = computed(() => turn.value?.streaming ?? false)
const sending = computed(() => turn.value?.sending ?? false)
const streamError = computed(() => turn.value?.error ?? '')
const lastQuestion = computed(() => turn.value?.question ?? '')
const currentStatus = computed(() => turn.value?.status ?? null)
const currentTopic = computed(() => turn.value?.topic ?? null)
const activitySteps = computed(() => turn.value?.steps ?? [])
const intakeFields = computed(() => turn.value?.intakeFields ?? null)
const intakeDefaults = computed(() => turn.value?.intakeDefaults ?? null)
const awaitingIntake = computed(() => turn.value?.awaitingIntake ?? false)
const intakeDismissed = computed(() => turn.value?.intakeDismissed ?? false)

/** The open thread as the user sees it: saved messages plus the live turn. */
const chatMessages = computed<Message[]>(
  () => chatStream.threadFor(conversationId.value, messages.value) as Message[],
)

/** Drives the Sources toggle's count; the panel does the same grouping. */
const citationCount = computed(() => collectCitations(chatMessages.value as ChatMessage[]).length)

/** The card the panel should scroll to, set by pressing a badge in an answer. */
const citationTarget = ref<CitationTarget | null>(null)

/** Only ever about the thread on screen — another thread may also be busy. */
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
  roles: kycKeys(auth.user?.kyc_role),
  useCases: kycKeys(auth.user?.kyc_use_case),
  documentTypes: kycKeys(auth.user?.kyc_document_types),
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
  // Any pending intake or partial answer belongs to the thread's live turn,
  // which the store still holds — nothing to reset here.
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
  } catch {
    notFound.value = true
  } finally {
    loading.value = false
  }

  // The messages container is unmounted while the loading skeleton shows, so
  // scrolling while `loading` is true silently no-ops and the thread mounts
  // stranded at the top. Only now — after the skeleton has been swapped for
  // the real thread — can the scroll land on the latest messages.
  await nextTick()
  scrollToBottom()

  // The answer may have landed while the user was on another thread, another
  // case, or another page; this is the moment to finish it off.
  const opened = activeConversationId.value ?? caseDetail.value?.conversation_id ?? null
  if (opened) await finalizeTurn(opened)
}

function cancelCreateThread() {
  creatingThread.value = false
  newThreadPurpose.value = ''
}

async function selectConversation(id: string) {
  if (id === activeConversationId.value) return
  cancelCreateThread()
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

async function refreshTodos(conversation: string | null = conversationId.value) {
  if (!conversation) return
  await todoStore.fetchTodos(conversation)
}

// The conversation is passed in rather than read from the page: an answer can
// land after the user has moved to another thread, and its tasks belong to the
// thread that produced them.
async function maybeCreateTodosFromText(text: string, conversation: string | null) {
  if (!conversation || !text) return
  const items = extractTodoItems(text)
  if (items.length === 0) return
  try {
    await todoStore.addTodos(items, conversation)
    await todoStore.fetchTodos(conversation)
  } catch {
    // Non-critical: todos are a convenience, never block the chat on failure.
  }
}

function getDisplayedContent(msg: Message): string {
  return msg.content
}

/**
 * The plan ran out mid-send. The case view stays put and offers the upgrade,
 * rather than redirecting away from the matter the user is working on, so the
 * inline error is left in place too.
 */
function handleUpgradeRequired(message: string): boolean {
  toast.error(`${message}. Upgrade your plan to continue.`, {
    action: { label: 'Upgrade', onClick: () => navigateTo('/settings/billing') },
  })

  return false
}

async function send(questionOverride?: string | Event) {
  const question = (typeof questionOverride === 'string' ? questionOverride : input.value).trim()
  const id = conversationId.value
  if (!question || busy.value || !id || readOnly.value) return

  input.value = ''
  // The files travel with this message; the uploads themselves stay attached
  // to the case and remain retrievable in its conversations.
  const attached = attachmentsState.take()

  // Deliberately not awaited: the answer belongs to the thread from here on,
  // and this page is free to be left, or unmounted, while it arrives.
  void chatStream.start({
    conversationId: id,
    question,
    // The case view, not the progress view: the thread is what to come back to.
    returnTo: `/cases/${route.params.id}`,
    attachments: attached,
    onUpgrade: handleUpgradeRequired,
  })

  await nextTick()
  scrollToBottom()
}

/**
 * Wrap a finished turn up: save what it produced, then hand the thread back to
 * the server's copy.
 *
 * Called from the watcher below when the answer lands while the user is
 * watching, and from `load` when it landed while they were on another thread,
 * another case, or another page entirely.
 */
const finalizing = new Set<string>()

async function finalizeTurn(id: string) {
  const finished = chatStream.turnFor(id)
  // Both the watcher and `load` can reach a finished turn, and running the
  // follow-up twice would file the same tasks twice.
  if (!finished?.finishedAt || finalizing.has(id)) return

  finalizing.add(id)

  // A pending intake form or a failed turn still has work left in it, so the
  // turn stays until the user submits, abandons, or retries.
  const keep = finished.intakeFields !== null || finished.error !== ''

  try {
    if (caseDetail.value) {
      const data = await caseStore.fetchCase(String(route.params.id), activeConversationId.value)
      caseDetail.value = data
      threads.value = data.conversations ?? []
      // The user may have moved to another thread while the answer was
      // finishing; what they are reading now must not be overwritten by this.
      if (!keep && conversationId.value === id) {
        messages.value = (data.messages ?? []) as Message[]
      }
      await loadGeneratedDocuments()
    }

    if (!keep) chatStream.settle(id)

    if (!finished.todoToolCalled) {
      await maybeCreateTodosFromText(finished.assistantMessage?.content ?? '', id)
    }
    await refreshTodos(id)
  } finally {
    finalizing.delete(id)
  }

  await nextTick()
  scrollToBottom()
}

/**
 * The watcher, rather than the send call, is what makes this survive leaving
 * the page: it re-runs against whichever turn just completed.
 */
watch(
  () => chatStream.turns[conversationId.value ?? '']?.finishedAt ?? null,
  (finishedAt, previous) => {
    if (!finishedAt || finishedAt === previous) return
    if (conversationId.value) void finalizeTurn(conversationId.value)
  },
)

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
  if (conversationId.value) chatStream.stop(conversationId.value)
}

function handleIntakeSubmit(data: Record<string, string>) {
  if (!conversationId.value) return
  chatStream.clearIntake(conversationId.value)
  const formatted = Object.entries(data)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')
  void send(`[Intake Form Submission]\n${formatted}`)
}

function handleIntakeCancel() {
  if (conversationId.value) chatStream.dismissIntake(conversationId.value)
}

function reopenIntake() {
  if (conversationId.value) chatStream.reopenIntake(conversationId.value)
}

function abandonIntake() {
  if (conversationId.value) chatStream.clearIntake(conversationId.value)
}

async function handleMarkdownClick(event: MouseEvent, msg: Message) {
  const mark = citationMarkFrom(event.target)

  if (mark !== null) {
    event.preventDefault()
    revealCitation(mark, msg as ChatMessage)
    return
  }

  const link = (event.target as HTMLElement).closest('a[data-export-url]')
  if (!link) return
  event.preventDefault()
  const type = (link.getAttribute('data-export-type') as 'word' | 'pdf') ?? 'word'
  const title = caseDetail.value?.title ?? (type === 'pdf' ? 'PDF Document' : 'Word Document')
  void openExport(msg.content, type, title, msg.template_id ? msg.id : undefined)
}

/**
 * A citation badge in the answer was pressed: open the sources panel on the
 * card it refers to. The badge is the reader's shortest route from "this
 * sentence is sourced" to what the source actually was.
 */
function revealCitation(mark: CitationMark, msg: ChatMessage) {
  const entry = findCitation(collectCitations(chatMessages.value as ChatMessage[]), msg, mark)

  if (entry === null) {
    toast('That source is no longer available')
    return
  }

  rightPanel.value = 'citations'
  citationTarget.value = { key: entry.key, at: Date.now() }
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
  if (!conversationId.value || !lastQuestion.value || busy.value) return
  void chatStream.retry(conversationId.value, handleUpgradeRequired)
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

/** Named apart from the case's own `statusLabel`, which reads the case record. */
const statusLabelNow = computed(() => turn.value?.statusLabel ?? null)

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

  if (citationCount.value > 0) {
    toggles.push({
      key: 'citations',
      label: 'Sources',
      icon: QuoteIcon,
      active: showCitations.value,
      count: citationCount.value,
      toggle: () => togglePanel('citations'),
    })
  }

  return toggles
})

watch(chatMessages, async () => {
  if (chatMessages.value.length === 0) return
  await nextTick()
  scrollToBottom()
}, { deep: true })

onMounted(async () => {
  window.addEventListener('keydown', onGlobalKeydown)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  await Promise.all([load(), loadTemplates()])
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  if (documentPollTimer !== null) {
    clearInterval(documentPollTimer)
    documentPollTimer = null
  }
  // The turn itself is deliberately left running: it belongs to the store, and
  // leaving this page is exactly the case it exists to survive.
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
      v-if="caseDetail && !loading && !fullscreen"
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
      :calendar-events="scheduleEvents"
      :streaming-thread-ids="chatStream.streamingIds"
      :readonly="readOnly"
      :case="caseDetail"
      :editable="!readOnly"
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
      @update-tags="saveCaseTags"
      @change-status="changeStatus"
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
          :panel-toggles="panelToggles"
          :fullscreen="fullscreen"
          @set-view="setView"
          @draft="pickerOpen = true"
          @edit="openEdit"
          @archive="archiveCase"
          @restore="restoreCase"
          @toggle-fullscreen="toggleFullscreen"
        />

        <div
          v-if="autoArchiveDate && !fullscreen"
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
          v-if="caseDetail && !fullscreen"
          class="md:hidden"
          :case="caseDetail"
          :editable="!readOnly"
          @update-tags="saveCaseTags"
          @change-status="changeStatus"
        />

        <div class="relative min-h-0 flex-1">
          <div ref="messagesContainer" class="absolute inset-0 overflow-y-auto">
            <ChatEmptyState
              v-if="chatMessages.length === 0"
              title="Work on this case"
              :description="emptyStateDescription"
              eyebrow="Batayan AI"
            >
              <ChatStarters :starters="starters" @select="selectPrompt" />
              <Button v-if="!readOnly" variant="outline" class="max-w-full gap-2 text-left" @click="pickerOpen = true">
                <FileTextIcon class="size-4 shrink-0 text-primary" />
                <span class="min-w-0 truncate text-sm">Draft a letter from a template</span>
              </Button>
            </ChatEmptyState>

            <ChatThread
              v-else
              :messages="chatMessages"
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
            :messages="chatMessages"
            @query="searchQuery = $event"
            @navigate="searchNavigate"
            @close="toggleSearch"
          />
        </div>

        <div class="border-t px-3 py-3">
          <div class="mx-auto w-full max-w-3xl">
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
          </div>
          <p v-if="!conversationId" class="mx-auto mt-1 max-w-3xl text-center text-xs text-muted-foreground">
            This case has no conversation thread yet.
          </p>
        </div>
        </template>
      </template>
    </section>

    <!-- Floating Document Preview Panel (Large Screens) -->
    <aside
      v-if="previewDoc && !fullscreen"
      class="relative hidden lg:flex shrink-0 flex-col border-l bg-card"
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
      v-if="!fullscreen"
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

    <div
      v-if="!fullscreen"
      class="grid h-full transition-[grid-template-columns] duration-200 ease-out"
      :style="{ gridTemplateColumns: showCitations && view === 'chat' ? '1fr' : '0fr' }"
    >
      <div class="h-full min-w-0 overflow-hidden">
        <CitationsPanel
          :visible="showCitations && view === 'chat'"
          :messages="(chatMessages as ChatMessage[])"
          :target="citationTarget"
          @close="rightPanel = null"
        />
      </div>
    </div>

    <DocumentViewer v-if="viewingDocument" :document="viewingDocument" @close="viewingDocument = null" />

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
        <div class="absolute inset-4 flex flex-col rounded-lg bg-popover shadow-xl">
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

