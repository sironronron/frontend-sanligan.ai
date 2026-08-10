<script setup lang="ts">
import { toast } from '~/components/ui/sonner'
import {
  FileIcon,
  Loader2Icon,
  ScaleIcon,
  SparklesIcon,
  XIcon,
  DownloadIcon,
  ListChecksIcon,
  BookOpenIcon,
  SearchIcon,
  PanelLeftIcon,
} from '@lucide/vue'
import { ensureCsrfCookie, getXsrfToken } from '~/lib/http'
import { useTodoStore } from '~/stores/todos'
import { useBillingStore, upgradeMessage } from '~/stores/billing'
import IntakeFormSheet from '~/components/IntakeFormSheet.vue'
import TaskPanel from '~/components/TaskPanel.vue'
import CitationPanel from '~/components/CitationPanel.vue'
import type { IntakeField } from '~/components/IntakeFormSheet.vue'
import ChatThread from '~/components/chat/ChatThread.vue'
import ChatComposer from '~/components/chat/ChatComposer.vue'
import ChatEmptyState from '~/components/chat/ChatEmptyState.vue'
import ChatConversationList from '~/components/chat/ChatConversationList.vue'
import ChatScrollToBottom from '~/components/chat/ChatScrollToBottom.vue'
import ChatSearchBar from '~/components/chat/ChatSearchBar.vue'

definePageMeta({
  middleware: ['auth', 'organization', 'subscription'],
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

interface Conversation {
  id: string
  title: string | null
  messages_count: number
  last_message_at: string | null
  created_at: string
  updated_at: string
  messages?: Message[]
}

const api = useApi()
const route = useRoute()
const router = useRouter()
const {
  public: { apiBase },
} = useRuntimeConfig()

const conversations = ref<Conversation[]>([])
const activeId = ref<string | null>(null)
const messages = ref<Message[]>([])
const input = ref('')
const streaming = ref(false)
const streamError = ref('')
const sending = ref(false)
const streamController = ref<AbortController | null>(null)
const currentStatus = ref<string | null>(null)
const currentStatusLabel = ref<string | null>(null)
const lastQuestion = ref('')
let messageStartIndex = -1

const showCitations = ref(true)
const activeCitation = ref<{ kind: string; index?: number; token?: string } | null>(null)
const ratingBusy = ref<string | null>(null)

const searchOpen = ref(false)
const searchQuery = ref('')
const searchActiveId = ref<string | null>(null)
const searchBarRef = ref<InstanceType<typeof ChatSearchBar> | null>(null)

const mobileConversations = ref(false)

const activeAssistantMessage = computed<Message | null>(() => {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    const m = messages.value[i]
    if (m && m.role === 'assistant' && m.sources.length > 0) return m
  }
  return null
})

const hasCitations = computed(() => activeAssistantMessage.value !== null)

const busy = computed(() => sending.value || streaming.value)

const messagesContainer = ref<HTMLElement | null>(null)

const { previewDoc, previewWidth, startResize, openExport, closePreview } = useDocumentExport()

const todoStore = useTodoStore()
const billing = useBillingStore()
const showTodos = ref(false)
const intakeFields = ref<IntakeField[] | null>(null)
const intakeDefaults = ref<Record<string, string> | null>(null)
const awaitingIntake = ref(false)
const intakeDismissed = ref(false)
const todoToolCalled = ref(false)

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

const activeConversation = computed(
  () => conversations.value.find((c) => c.id === activeId.value) ?? null,
)

async function loadConversations() {
  try {
    const { data } = await api<{ data: Conversation[] }>('/conversations')
    conversations.value = data
  } catch {
    conversations.value = []
  }
}

async function loadConversation(id: string) {
  try {
    const { data } = await api<{ data: Conversation }>(`/conversations/${id}`)
    activeId.value = id
    messages.value = data.messages ?? []
    intakeFields.value = null
    intakeDefaults.value = null
    awaitingIntake.value = false
    intakeDismissed.value = false
    await router.replace({ query: { c: id } })
  } catch {
    toast.error('Could not load the conversation')
  }
}

async function createConversation() {
  const { data } = await api<{ data: Conversation }>('/conversations', {
    method: 'POST',
  })
  activeId.value = data.id
  await loadConversations()
  await router.replace({ query: { c: data.id } })
  return data
}

async function startNewChat() {
  if (busy.value) return
  activeId.value = null
  messages.value = []
  streamError.value = ''
  intakeFields.value = null
  intakeDefaults.value = null
  awaitingIntake.value = false
  intakeDismissed.value = false
  await router.replace({ query: {} })
}

async function switchConversation(id: string) {
  if (busy.value || id === activeId.value) return
  await loadConversation(id)
}

async function deleteConversation(id: string) {
  await api(`/conversations/${id}`, { method: 'DELETE' })
  if (activeId.value === id) {
    activeId.value = null
    messages.value = []
    await router.replace({ query: {} })
  }
  await loadConversations()
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
    target.content += payload.delta
    currentStatus.value = null
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
  if (activeId.value) {
    await todoStore.fetchTodos(activeId.value)
    showTodos.value = true
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

async function maybeCreateTodosFromText(text: string, conversationId: string | null) {
  if (!conversationId || todoToolCalled.value || !text) return
  const items = extractTodoItems(text)
  if (items.length === 0) return
  try {
    await todoStore.addTodos(items, conversationId)
    await todoStore.fetchTodos(conversationId)
    showTodos.value = true
  } catch {
    // Non-critical: todos are a convenience, never block the chat on failure.
  }
}

async function handleIntakeSubmit(data: Record<string, string>) {
  intakeFields.value = null
  intakeDefaults.value = null
  awaitingIntake.value = false
  intakeDismissed.value = false
  const formatted = Object.entries(data)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')
  await send(`[Intake Form Submission]\n${formatted}`)
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

function getDisplayedContent(msg: Message): string {
  return msg.content
}

const statusLabel = computed(() => {
  if (!currentStatus.value) return null
  return currentStatusLabel.value ?? statusLabels[currentStatus.value] ?? currentStatus.value
})

function handleMarkdownClick(event: MouseEvent, msg: Message) {
  const target = event.target as HTMLElement
  const badge = target.closest('button[data-cite-kind]')
  if (badge) {
    const kind = badge.getAttribute('data-cite-kind')
    const token = badge.getAttribute('data-cite-token')
    const index = Number(badge.getAttribute('data-cite-index'))
    if (kind && (token !== null || Number.isFinite(index))) {
      showCitations.value = true
      activeCitation.value = token ? { kind, token } : { kind, index }
    }
    return
  }

    const link = target.closest('a[data-export-url]')
    if (link) {
      event.preventDefault()
      const type = (link.getAttribute('data-export-type') as 'word' | 'pdf') ?? 'word'
      const title = activeConversation.value?.title ?? (type === 'pdf' ? 'PDF Document' : 'Word Document')
      void openExport(msg.content, type, title, msg.template_id ? msg.id : undefined)
    }
}

async function refreshMessages() {
  if (!activeId.value) return
  try {
    const { data } = await api<{ data: Conversation }>(`/conversations/${activeId.value}`)
    messages.value = data.messages ?? []
  } catch {
    // keep the streamed state if the refresh fails
  }
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

function handleExport(m: Message, type: 'word' | 'pdf') {
  const title = activeConversation.value?.title ?? (type === 'pdf' ? 'PDF Document' : 'Word Document')
  void openExport(m.content, type, title, m.template_id ? m.id : undefined)
}

async function send(questionOverride?: string | Event) {
  const question = (typeof questionOverride === 'string' ? questionOverride : input.value).trim()
  if (!question || sending.value) return

  messageStartIndex = messages.value.length
  lastQuestion.value = question
  sending.value = true
  streamError.value = ''
  currentStatus.value = null
  currentStatusLabel.value = null
  input.value = ''
  todoToolCalled.value = false
  resetSteps()

  if (question.startsWith('[Intake Form Submission]')) {
    markStepActive('drafting', 'Drafting your document')
  }

  let lastAssistantText = ''

  try {
    let conv = activeConversation.value

    if (!conv) {
      conv = await createConversation()
    }

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

    const xsrfToken = getXsrfToken()
    streamController.value = new AbortController()
    const response = await fetch(`${apiBase}/api/conversations/${conv.id}/messages`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(xsrfToken ? { 'X-XSRF-TOKEN': xsrfToken } : {}),
      },
      body: JSON.stringify({ message: question }),
      signal: streamController.value.signal,
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      const upgrade = upgradeMessage({ status: response.status, data: payload })
      if (upgrade) {
        await navigateTo('/pricing')
        return
      }
      throw new Error(upgrade ?? 'Something went wrong while streaming the response.')
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
      await nextTick()
      scrollToBottom()
    }

    lastAssistantText = assistant.content
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      streamError.value = ''
    } else {
      streamError.value = err?.message ?? 'Something went wrong while streaming the response.'
    }
  } finally {
    streamController.value = null
    currentStatus.value = null
    currentStatusLabel.value = null
    streaming.value = false
    sending.value = false

    await loadConversations()
    await maybeCreateTodosFromText(lastAssistantText, activeId.value)
    if (!awaitingIntake.value) {
      await refreshMessages()
    }
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
  } else {
    nextTick(() => searchBarRef.value?.focusInput())
  }
}

function searchNavigate(messageId: string) {
  searchActiveId.value = messageId
  nextTick(() => {
    document.getElementById(`msg-${messageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

function onGlobalKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    toggleSearch()
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown))

function stopStreaming() {
  streamController.value?.abort()
  streamController.value = null
  currentStatus.value = null
  currentStatusLabel.value = null
  awaitingIntake.value = false
  streamError.value = ''
}

function retryLast() {
  if (!lastQuestion.value || busy.value) return
  if (messageStartIndex >= 0) {
    messages.value.splice(messageStartIndex)
  }
  streamError.value = ''
  void send(lastQuestion.value)
}

onMounted(async () => {
  await billing.fetchSubscription()

  if (!billing.accessGranted) {
    await navigateTo('/pricing')
    return
  }

  await loadConversations()

  if (route.query.c) {
    await loadConversation(String(route.query.c))
  }
})

watch(messages, async () => {
  await nextTick()
  scrollToBottom()
}, { deep: true })

watch(activeId, async (id) => {
  if (id) {
    await todoStore.fetchTodos(id)
    showTodos.value = todoStore.todos.filter((t) => t.conversation_id === id).length > 0
  } else {
    showTodos.value = false
  }
})

onBeforeUnmount(() => {
  streamController.value?.abort()
  streamController.value = null
})
</script>

<template>
  <div class="flex h-[calc(100dvh-3.5rem)] overflow-hidden">
    <ChatConversationList
      class="hidden md:flex"
      :conversations="conversations"
      :active-id="activeId"
      :busy="busy"
      @new="startNewChat"
      @select="switchConversation"
      @delete="deleteConversation"
    />

    <section class="flex min-w-0 flex-1 flex-col">
      <div class="flex items-center justify-between border-b px-2 py-2.5 sm:px-4">
          <div class="flex min-w-0 items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              class="shrink-0 md:hidden"
              aria-label="Conversations"
              @click="mobileConversations = true"
            >
              <PanelLeftIcon class="size-4" />
            </Button>
            <span class="min-w-0 truncate text-xs text-muted-foreground">
              {{ sending ? 'Creating…' : streaming ? (statusLabel ?? 'Responding…') : (activeConversation ? 'Ready' : 'New conversation') }}
            </span>
          </div>
          <div class="flex shrink-0 items-center gap-1 sm:gap-1.5">
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
            <Button
              v-if="activeAssistantMessage"
              variant="ghost"
              size="sm"
              class="gap-1.5 px-2 text-xs sm:px-3"
              :class="{ 'text-primary': showCitations }"
              @click="showCitations = !showCitations"
            >
              <BookOpenIcon class="size-4" />
              <span class="hidden sm:inline">{{ showCitations ? 'Hide citations' : 'Citations' }}</span>
              <Badge v-if="activeAssistantMessage.sources.length > 0" variant="secondary" class="px-1.5 text-[10px]">
                {{ activeAssistantMessage.sources.length }}
              </Badge>
            </Button>
            <Button
              v-if="activeConversation"
              variant="ghost"
              size="sm"
              class="gap-1.5 px-2 text-xs sm:px-3"
              :class="{ 'text-primary': showTodos }"
              @click="showTodos = !showTodos"
            >
              <ListChecksIcon class="size-4" />
              <span class="hidden sm:inline">{{ showTodos ? 'Hide tasks' : 'Tasks' }}</span>
              <Badge v-if="activeId && todoStore.todos.some((t) => t.conversation_id === activeId)" variant="secondary" class="px-1.5 text-[10px]">
                {{ todoStore.todos.filter((t) => t.conversation_id === activeId).length }}
              </Badge>
            </Button>
          </div>
      </div>

      <div class="relative min-h-0 flex-1">
        <div ref="messagesContainer" class="absolute inset-0 overflow-y-auto">
          <ChatEmptyState
            v-if="messages.length === 0"
            title="Research Philippine law with Batayan"
            description="Ask about statutes, Supreme Court decisions, or your uploaded documents. Answers are grounded in retrieved sources and cited inline."
            eyebrow="Batayan AI"
          >
          <Button variant="outline" class="justify-start gap-2 text-left" @click="input = 'What is the scope of the Comprehensive Agrarian Reform Program?'">
            <SparklesIcon class="size-4 text-primary" />
            <span class="truncate text-xs">Agrarian reform scope</span>
          </Button>
          <Button variant="outline" class="justify-start gap-2 text-left" @click="input = 'Summarize the ruling in G.R. No. 143491.'">
            <ScaleIcon class="size-4 text-primary" />
            <span class="truncate text-xs">Summarize a ruling</span>
          </Button>
          <Button variant="outline" class="justify-start gap-2 text-left" @click="input = 'Compare RA 6657 with my uploaded documents.'">
            <FileIcon class="size-4 text-primary" />
            <span class="truncate text-xs">Compare my documents</span>
          </Button>
        </ChatEmptyState>

        <ChatThread
          v-else
          :messages="messages"
          :streaming="streaming"
          :status-label="statusLabel"
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
          @markdown-click="handleMarkdownClick"
          @rate="rateMessage"
          @export="handleExport"
          @retry="retryLast"
          @abandon-intake="abandonIntake"
          @reopen-intake="reopenIntake"
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
        <ChatComposer
          v-model="input"
          :disabled="busy"
          :streaming="streaming"
          placeholder="Ask about Philippine law or your documents…"
          @send="send()"
          @stop="stopStreaming"
        />
      </div>
    </section>

    <TaskPanel
      v-if="showTodos && activeId"
      :conversation-id="activeId"
      @close="showTodos = false"
    />

    <CitationPanel
      v-if="hasCitations && showCitations"
      :message="activeAssistantMessage"
      :active-citation="activeCitation"
      @close="showCitations = false"
    />

    <!-- Floating Document Preview Panel (Large Screens) -->
    <aside
      v-if="previewDoc"
      class="relative hidden lg:flex shrink-0 flex-col border-l bg-background"
      :style="{ width: `${previewWidth}px` }"
    >
      <div
        class="group absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize touch-none select-none"
        aria-hidden="true"
        @pointerdown="startResize"
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

    <IntakeFormSheet
      v-if="intakeFields && !intakeDismissed"
      :fields="intakeFields"
      :initial-values="intakeDefaults ?? {}"
      @submit="handleIntakeSubmit"
      @cancel="handleIntakeCancel"
    />

    <Teleport to="body">
      <div v-if="mobileConversations" class="fixed inset-0 z-50 md:hidden">
        <div class="absolute inset-0 bg-black/60" @click="mobileConversations = false" />
        <div class="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-background shadow-xl">
          <div class="flex h-12 shrink-0 items-center justify-between border-b px-3">
            <span class="text-sm font-semibold">Conversations</span>
            <Button variant="ghost" size="icon" class="size-8" aria-label="Close conversations" @click="mobileConversations = false">
              <XIcon class="size-4" />
            </Button>
          </div>
          <div class="min-h-0 flex-1">
            <ChatConversationList
              class="h-full w-full border-r-0"
              :conversations="conversations"
              :active-id="activeId"
              :busy="busy"
              @new="startNewChat"
              @select="(id: string) => { switchConversation(id); mobileConversations = false }"
              @delete="deleteConversation"
            />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
