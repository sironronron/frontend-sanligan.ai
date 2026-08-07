<script setup lang="ts">
import { toast } from '~/components/ui/sonner'
import {
  ArrowLeftIcon,
  CheckIcon,
  ClipboardCheckIcon,
  DownloadIcon,
  FileTextIcon,
  ListChecksIcon,
  Loader2Icon,
  MessagesSquareIcon,
  PencilIcon,
  PlusIcon,
  ScaleIcon,
  SendIcon,
  SparklesIcon,
  TrashIcon,
  XIcon,
  FileIcon,
  FileUpIcon,
  ExternalLinkIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
  BookOpenIcon,
} from '@lucide/vue'
import { ensureCsrfCookie, getXsrfToken } from '~/lib/http'
import { renderMarkdown } from '~/utils/markdown'
import { useCaseStore, type LegalCase, type CaseIntake, type CaseConversation } from '~/stores/cases'
import { useTodoStore } from '~/stores/todos'
import { upgradeMessage } from '~/stores/billing'
import CaseIntakeForm, { type CaseIntakePayload, type IntakeTemplateOption } from '~/components/CaseIntakeForm.vue'
import TemplatePicker, { type TemplateOption } from '~/components/TemplatePicker.vue'
import TaskPanel from '~/components/TaskPanel.vue'
import CitationPanel from '~/components/CitationPanel.vue'
import IntakeFormSheet, { type IntakeField } from '~/components/IntakeFormSheet.vue'

definePageMeta({
  middleware: 'auth',
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

const caseDetail = ref<LegalCase | null>(null)
const loading = ref(true)
const notFound = ref(false)
const editOpen = ref(false)
const pickerOpen = ref(false)
const templates = ref<TemplateOption[]>([])
const showTasks = ref(true)

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
const currentStatus = ref<string | null>(null)
const intakeFields = ref<IntakeField[] | null>(null)
const intakeDefaults = ref<Record<string, string> | null>(null)
const awaitingIntake = ref(false)
const intakeDismissed = ref(false)
const todoToolCalled = ref(false)
const messagesContainer = ref<HTMLElement | null>(null)
const lastQuestion = ref('')
let messageStartIndex = -1

const showCitations = ref(true)
const activeCitation = ref<{ kind: string; index: number } | null>(null)
const ratingBusy = ref<string | null>(null)

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
let documentPollTimer: ReturnType<typeof setInterval> | null = null

const documentStatusStyles: Record<CaseDocument['status'], string> = {
  queued: 'bg-muted text-muted-foreground',
  processing: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  ready: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
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

const mainChatEl = ref<HTMLElement | null>(null)

// Reserve a minimum comfortable chat width so the PDF preview resize can never
// cross into the conversation area.
const CHAT_MIN_WIDTH = 400

function previewMaxWidth(): number {
  const chatWidth = mainChatEl.value?.getBoundingClientRect().width ?? 0
  return Math.max(chatWidth - CHAT_MIN_WIDTH, 320)
}

const conversationId = computed(() => activeConversationId.value ?? caseDetail.value?.conversation_id ?? null)
const busy = computed(() => sending.value || streaming.value)

const statusLabels: Record<string, string> = {
  checking_sources: 'Checking legal sources',
  searching_web: 'Searching the web',
  composing: 'Composing response',
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
  open: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  in_progress: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  on_hold: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  closed: 'bg-muted text-muted-foreground',
}

const priorityStyles: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  high: 'bg-red-500/10 text-red-600 dark:text-red-400',
  urgent: 'bg-red-600/10 text-red-700 dark:text-red-500',
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
    if (payload.status === 'collecting_facts') {
      awaitingIntake.value = true
      markStepActive('collecting_facts', 'Collecting the facts I need')
    } else {
      markStepActive(payload.status, statusLabels[payload.status] ?? payload.status)
    }
  } else if (event === 'delta' && typeof payload.delta === 'string') {
    target.content += payload.delta
    currentStatus.value = null
    awaitingIntake.value = false
    completeStep('composing')
  } else if (event === 'tool_call') {
    handleToolCall(payload, target)
  } else if (event === 'tool_result' && payload.name === 'create_todo') {
    todoToolCalled.value = true
    refreshTodos()
    completeStep('create_todo')
  } else if (event === 'done') {
    completeActiveSteps()
    if (intakeFields.value === null) {
      awaitingIntake.value = false
    }
  } else if (event === 'error') {
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
  const regex = /^\s*[-*]\s+\[( |x|X)\]\s+(.+)$/gm
  let match: RegExpExecArray | null
  while ((match = regex.exec(cleaned)) !== null) {
    items.push({
      title: (match[2] ?? '').trim(),
      status: match[1] === ' ' ? 'pending' : 'completed',
    })
  }
  return items
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

async function send(questionOverride?: string | Event) {
  const question = (typeof questionOverride === 'string' ? questionOverride : input.value).trim()
  if (!question || sending.value || !conversationId.value) return

  messageStartIndex = messages.value.length
  lastQuestion.value = question
  sending.value = true
  streamError.value = ''
  currentStatus.value = null
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
    streaming.value = true

    await nextTick()
    scrollToBottom()

    await ensureCsrfCookie(apiBase)

    const response = await fetch(`${apiBase}/api/conversations/${conversationId.value}/messages`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-XSRF-TOKEN': getXsrfToken() ?? '',
      },
      body: JSON.stringify({ message: question }),
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

    lastAssistantText = assistant.content
  } catch (err: any) {
    streamError.value = err?.message ?? 'Something went wrong while streaming the response.'
  } finally {
    streaming.value = false
    sending.value = false
    currentStatus.value = null

    if (conversationId.value && caseDetail.value) {
      const data = await caseStore.fetchCase(String(route.params.id), activeConversationId.value)
      caseDetail.value = data
      threads.value = data.conversations ?? []
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

interface IntakePair {
  key: string
  label: string
  value: string
}

function intakePairs(content: string): IntakePair[] | null {
  if (!content.startsWith('[Intake Form Submission]')) return null
  const pairs: IntakePair[] = []
  for (const line of content.split('\n').slice(1)) {
    const idx = line.indexOf(': ')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    pairs.push({
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
      value: line.slice(idx + 2).trim(),
    })
  }
  return pairs.length > 0 ? pairs : null
}

async function handleMarkdownClick(event: MouseEvent, msg: Message) {
  const target = event.target as HTMLElement
  const badge = target.closest('button[data-cite-kind]')
  if (badge) {
    const kind = badge.getAttribute('data-cite-kind')
    const index = Number(badge.getAttribute('data-cite-index'))
    if (kind && Number.isFinite(index)) {
      showCitations.value = true
      activeCitation.value = { kind, index }
    }
    return
  }

  const link = target.closest('a[data-export-url]')
  if (!link) return
  event.preventDefault()
  const type = (link.getAttribute('data-export-type') as 'word' | 'pdf') ?? 'word'
  const title = caseDetail.value?.title ?? (type === 'pdf' ? 'PDF Document' : 'Word Document')
  void openExport(msg.content, type, title)
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

function parseUrl(url: string): { hostname: string; pathname: string } {
  try {
    const parsed = new window.URL(url)
    return { hostname: parsed.hostname, pathname: parsed.pathname }
  } catch {
    return { hostname: url, pathname: '' }
  }
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
  return statusLabels[currentStatus.value] ?? currentStatus.value
})

watch(messages, async () => {
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
                class="size-6 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
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
      class="flex flex-1 flex-col"
      :style="{ minWidth: `${CHAT_MIN_WIDTH}px` }"
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

            <div class="flex shrink-0 items-center gap-2">
              <Button v-if="!caseDetail.archived_at" variant="outline" size="sm" class="gap-1.5 text-xs" @click="openEdit">
                <PencilIcon class="size-3.5" />
                Edit
              </Button>
              <Button v-if="!caseDetail.archived_at" size="sm" class="gap-1.5 text-xs" @click="pickerOpen = true">
                <FileTextIcon class="size-3.5" />
                Draft a letter
              </Button>
              <Button
                v-if="activeAssistantMessage"
                variant="ghost"
                size="sm"
                class="gap-1.5 text-xs"
                :class="{ 'text-primary': showCitations }"
                @click="showCitations = !showCitations"
              >
                <BookOpenIcon class="size-4" />
                <span>{{ showCitations ? 'Hide citations' : 'Citations' }}</span>
                <Badge v-if="activeAssistantMessage.sources.length > 0" variant="secondary" class="px-1.5 text-[10px]">
                  {{ activeAssistantMessage.sources.length }}
                </Badge>
              </Button>
              <Button
                v-if="conversationId"
                variant="ghost"
                size="sm"
                class="gap-1.5 text-xs"
                :class="{ 'text-primary': showTasks }"
                @click="showTasks = !showTasks"
              >
                <ListChecksIcon class="size-4" />
                <span>{{ showTasks ? 'Hide tasks' : 'Tasks' }}</span>
                <Badge v-if="todoStore.todos.length > 0" variant="secondary" class="px-1.5 text-[10px]">
                  {{ todoStore.todos.filter((t) => t.status !== 'completed').length }}
                </Badge>
              </Button>
              <Button v-if="!caseDetail.archived_at" variant="ghost" size="sm" class="gap-1.5 text-xs text-muted-foreground" @click="archiveCase">
                <TrashIcon class="size-3.5" />
                Archive
              </Button>
              <Button v-else variant="ghost" size="sm" class="gap-1.5 text-xs" @click="restoreCase">
                <PlusIcon class="size-3.5" />
                Restore
              </Button>
            </div>
          </div>

          <div v-if="caseDetail.description || caseDetail.related_parties?.length || caseDetail.tags?.length" class="mt-3 border-t pt-3">
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

        <div ref="messagesContainer" class="flex-1 overflow-y-auto">
          <div v-if="messages.length === 0" class="flex h-full flex-col items-center justify-center px-6 text-center">
            <div class="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10">
              <ScaleIcon class="size-6 text-primary" />
            </div>
            <h2 class="text-lg font-semibold">Work on this case</h2>
            <p class="mt-1 max-w-md text-sm text-muted-foreground">
              Ask about the law, draft correspondence, or summarize case facts. You can also pick a
              template to draft a letter.
            </p>
            <div class="mt-6 flex flex-wrap justify-center gap-2">
              <Button variant="outline" class="justify-start text-left" @click="pickerOpen = true">
                <FileTextIcon class="size-4 text-primary" />
                <span class="text-xs">Draft a letter from a template</span>
              </Button>
              <Button variant="outline" class="justify-start text-left" @click="input = 'Summarize the key facts and deadlines of this case.'">
                <SparklesIcon class="size-4 text-primary" />
                <span class="text-xs">Summarize this case</span>
              </Button>
            </div>
          </div>

          <div v-else class="mx-auto max-w-3xl space-y-6 px-4 py-6">
            <div v-for="m in messages" :key="m.id" class="flex items-start gap-3" :class="m.role === 'user' ? 'flex-row-reverse' : ''">
              <div
                class="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                :class="m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'"
              >
                {{ m.role === 'user' ? 'You' : 'AI' }}
              </div>
              <div class="flex min-w-0 flex-1 flex-col space-y-2" :class="m.role === 'user' ? 'items-end' : 'items-start'">
                <div
                  v-if="m.role === 'assistant' && streaming && m.id === messages[messages.length - 1]?.id && !m.content && statusLabelNow && !awaitingIntake"
                  class="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-transparent"
                >
                  <span class="inline-flex items-center gap-1.5 text-muted-foreground">
                    <span class="size-1.5 animate-pulse rounded-full bg-primary" />
                    {{ statusLabelNow }}
                  </span>
                  <ActivityTimeline v-if="activitySteps.length > 0" :steps="activitySteps" class="mt-3" />
                </div>
                <div
                  v-else
                  class="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
                  :class="m.role === 'user' ? 'bg-muted' : 'bg-transparent'"
                >
                  <div v-if="m.role === 'user'">
                    <template v-if="intakePairs(m.content)">
                      <div class="rounded-xl border bg-background/70 px-3 py-2.5 shadow-sm">
                        <p class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                          <ClipboardCheckIcon class="size-3.5" />
                          Intake Form Submitted
                        </p>
                        <dl class="mt-2.5 space-y-2">
                          <div v-for="pair in intakePairs(m.content)" :key="pair.key">
                            <dt class="text-[10px] uppercase tracking-wide text-muted-foreground/80">{{ pair.label }}</dt>
                            <dd class="mt-0.5 whitespace-pre-wrap break-words text-[13px]">{{ pair.value || '—' }}</dd>
                          </div>
                        </dl>
                      </div>
                    </template>
                    <template v-else>
                      <div class="whitespace-pre-wrap break-words">{{ m.content }}</div>
                    </template>
                  </div>
                  <div v-else class="break-words" v-html="renderMarkdown(m.content)" @click="handleMarkdownClick($event, m)" />
                </div>

                <div v-if="m.role === 'assistant' && !m.id.startsWith('local-')" class="mt-1 flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    class="size-6"
                    :class="{ 'bg-primary/10 text-primary': m.feedback === 'up' }"
                    :title="m.feedback === 'up' ? 'Remove rating' : 'Helpful'"
                    @click="rateMessage(m, 'up')"
                  >
                    <ThumbsUpIcon class="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="size-6"
                    :class="{ 'bg-destructive/10 text-destructive': m.feedback === 'down' }"
                    :title="m.feedback === 'down' ? 'Remove rating' : 'Not helpful'"
                    @click="rateMessage(m, 'down')"
                  >
                    <ThumbsDownIcon class="size-3.5" />
                  </Button>
                </div>

                <div v-if="m.role === 'assistant' && !m.id.startsWith('local-') && m.content.trim() && m.content.includes('/export/')" class="mt-1 flex items-center gap-1.5">
                  <span class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Export</span>
                <Button variant="outline" size="sm" class="h-7 gap-1.5 px-2.5 text-xs" @click="openExport(m.content, 'word', caseDetail?.title ?? 'Word Document')">
                  <FileTextIcon class="size-3.5" />
                  Word
                </Button>
                <Button variant="outline" size="sm" class="h-7 gap-1.5 px-2.5 text-xs" @click="openExport(m.content, 'pdf', caseDetail?.title ?? 'PDF Document')">
                    <FileTextIcon class="size-3.5" />
                    PDF
                  </Button>
                </div>

                <div v-if="m.sources.length > 0" class="w-full max-w-[85%] space-y-1.5 lg:hidden">
                  <p class="text-xs font-medium text-muted-foreground">Sources</p>
                  <div
                    v-for="(source, index) in m.sources"
                    :key="`${source.label}-${index}`"
                    class="rounded-lg border bg-card p-3"
                  >
                    <div class="flex items-start gap-2">
                      <Badge variant="secondary" class="mt-0.5 h-5 shrink-0 text-[10px]">
                        {{ source.type === 'legal' ? 'LEGAL' : source.type === 'web' ? 'WEB' : 'DOCUMENT' }}
                      </Badge>
                      <div class="min-w-0 flex-1">
                        <p class="text-sm font-medium leading-tight">{{ source.title || source.label }}</p>
                        <p v-if="source.title && source.label && source.title !== source.label" class="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                          {{ source.label }}
                        </p>
                        <a
                          v-if="source.url"
                          :href="source.url"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                        >
                          <ExternalLinkIcon class="size-3" />
                          {{ parseUrl(source.url).hostname }}
                        </a>
                      </div>
                    </div>
                    <p v-if="source.excerpt" class="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {{ source.excerpt }}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="awaitingIntake" class="flex items-start gap-3">
              <div class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                AI
              </div>
              <div class="intake-waiting max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed">
                <div class="flex items-center gap-2.5">
                  <span class="shining-text font-medium">{{ currentStatus === 'collecting_facts' ? 'Tinkering with your request' : 'Needed more information from you' }}</span>
                  <span class="flex items-center gap-1">
                    <span class="waiting-dot" />
                    <span class="waiting-dot" style="animation-delay: 0.15s" />
                    <span class="waiting-dot" style="animation-delay: 0.3s" />
                  </span>
                </div>
                <ActivityTimeline v-if="activitySteps.length > 0" :steps="activitySteps" class="mt-3" />
              </div>
            </div>

            <div v-if="intakeFields && intakeDismissed" class="flex items-start gap-3">
              <div class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                AI
              </div>
              <div class="flex max-w-[85%] flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-sm">
                <div class="min-w-0 flex-1">
                  <p class="font-medium">Information form closed</p>
                  <p class="mt-0.5 text-xs text-muted-foreground">
                    Fill in the required details to continue drafting, or cancel this request.
                  </p>
                </div>
                <div class="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" class="h-8 text-xs" @click="abandonIntake">Cancel</Button>
                  <Button size="sm" class="h-8 text-xs" @click="reopenIntake">Fill requirement</Button>
                </div>
              </div>
            </div>

            <div v-if="streamError" class="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">
              <span class="flex-1">{{ streamError }}</span>
              <Button variant="outline" size="sm" class="h-7 gap-1.5 text-xs" :disabled="!lastQuestion || busy" @click="retryLast">
                <Loader2Icon v-if="busy" class="size-3.5 animate-spin" />
                Retry
              </Button>
            </div>
          </div>
        </div>

        <div class="border-t p-3">
          <form class="mx-auto flex max-w-3xl items-end gap-2" @submit.prevent="send()">
            <Textarea
              v-model="input"
              rows="1"
              class="max-h-40 min-h-10 resize-none"
              placeholder="Ask about this case, draft a letter, or summarize the facts…"
              :disabled="busy"
              @keydown.enter.exact.prevent="send()"
            />
            <Button type="submit" size="icon" :disabled="!input.trim() || busy || !conversationId">
              <Loader2Icon v-if="busy" class="size-4 animate-spin" />
              <SendIcon v-else class="size-4" />
              <span class="sr-only">Send</span>
            </Button>
          </form>
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

    <TaskPanel v-if="showTasks && conversationId" :conversation-id="conversationId" />

    <CitationPanel
      v-if="hasCitations && showCitations"
      :message="activeAssistantMessage"
      :active-citation="activeCitation"
      @close="showCitations = false"
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

<style scoped>
.intake-waiting {
  position: relative;
  overflow: hidden;
  background: color-mix(in oklab, var(--primary) 6%, transparent);
  border: 1px solid color-mix(in oklab, var(--primary) 22%, transparent);
}

.intake-waiting::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 40%;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in oklab, var(--primary) 10%, transparent),
    transparent
  );
  animation: shine-sweep 2.4s ease-in-out infinite;
}

@keyframes shine-sweep {
  0% { left: -50%; }
  55%, 100% { left: 120%; }
}

.shining-text {
  background: linear-gradient(
    90deg,
    var(--primary),
    color-mix(in oklab, var(--primary) 45%, transparent),
    var(--primary)
  );
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: text-shine 2.4s linear infinite;
}

@keyframes text-shine {
  to { background-position: -200% center; }
}

.waiting-dot {
  width: 5px;
  height: 5px;
  border-radius: 9999px;
  background: var(--primary);
  animation: dot-bounce 1.2s ease-in-out infinite;
}

@keyframes dot-bounce {
  0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-2px); }
}
</style>
