<script setup lang="ts">
import { toast } from '~/components/ui/sonner'
import {
  Loader2Icon,
  XIcon,
  DownloadIcon,
  ListChecksIcon,
  QuoteIcon,
  SearchIcon,
  PanelLeftIcon,
} from '@lucide/vue'
import { useTodoStore } from '~/stores/todos'
import { extractTodoItems } from '~/utils/todos'
import { useBillingStore } from '~/stores/billing'
import { useAuthStore } from '~/stores/auth'
import IntakeFormSheet from '~/components/IntakeFormSheet.vue'
import TaskPanel from '~/components/TaskPanel.vue'
import ChatThread from '~/components/chat/ChatThread.vue'
import ChatComposer from '~/components/chat/ChatComposer.vue'
import ChatEmptyState from '~/components/chat/ChatEmptyState.vue'
import ChatStarters from '~/components/chat/ChatStarters.vue'
import { useStarterSuggestions, type SuggestionContext } from '~/composables/useChatSuggestions'
import ChatConversationList from '~/components/chat/ChatConversationList.vue'
import CitationsPanel from '~/components/chat/CitationsPanel.vue'
import { citationMarkFrom, collectCitations, findCitation, type CitationMark } from '~/utils/citations'
import type { ChatMessage } from '~/types/chat'
import type { CitationTarget } from '~/types/citations'
import ChatScrollToBottom from '~/components/chat/ChatScrollToBottom.vue'
import ChatSearchBar from '~/components/chat/ChatSearchBar.vue'
import LabelPicker from '~/components/LabelPicker.vue'
import { useLabelStore, type AppliedLabel } from '~/stores/labels'
import type { ChatMessageAttachment } from '~/types/chat'

definePageMeta({
  middleware: ['auth', 'organization', 'onboarding', 'subscription'],
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

interface Conversation {
  id: string
  title: string | null
  messages_count: number
  last_message_at: string | null
  case_id?: string | null
  case_tags?: string[]
  tags?: AppliedLabel[]
  created_at: string
  updated_at: string
  messages?: Message[]
}

const api = useApi()
const route = useRoute()
const router = useRouter()

const conversations = ref<Conversation[]>([])
const activeId = ref<string | null>(null)
/** What the server has for the open thread; the live turn is added on top. */
const messages = ref<Message[]>([])
const input = ref('')
const composerRef = ref<InstanceType<typeof ChatComposer> | null>(null)

/**
 * The answer being generated does not belong to this page — it belongs to the
 * thread. Keeping it in the store is what lets the user walk away mid-answer,
 * see in the thread list that Batayan is still writing, and come back to a
 * finished (or still arriving) reply.
 */
const chatStream = useChatStreamStore()

const turn = computed(() => chatStream.turnFor(activeId.value))
const streaming = computed(() => turn.value?.streaming ?? false)
const sending = computed(() => turn.value?.sending ?? false)
const streamError = computed(() => turn.value?.error ?? '')
const lastQuestion = computed(() => turn.value?.question ?? '')
const currentStatus = computed(() => turn.value?.status ?? null)
const statusLabel = computed(() => turn.value?.statusLabel ?? null)
/** What this turn is about, sent once by the server and shown as the heading. */
const currentTopic = computed(() => turn.value?.topic ?? null)
const activitySteps = computed(() => turn.value?.steps ?? [])
const intakeFields = computed(() => turn.value?.intakeFields ?? null)
const intakeDefaults = computed(() => turn.value?.intakeDefaults ?? null)
const awaitingIntake = computed(() => turn.value?.awaitingIntake ?? false)
const intakeDismissed = computed(() => turn.value?.intakeDismissed ?? false)

/** The open thread as the user sees it: saved messages plus the live turn. */
const thread = computed<Message[]>(() => chatStream.threadFor(activeId.value, messages.value) as Message[])

/** Drives the Sources button's count; the panel does the same grouping. */
const citationCount = computed(() => collectCitations(thread.value as ChatMessage[]).length)

/** The card the panel should scroll to, set by pressing a badge in an answer. */
const citationTarget = ref<CitationTarget | null>(null)

/**
 * The right rail holds one panel at a time. Citations, the document preview,
 * and tasks used to sit open at once and squeeze the conversation into a
 * narrow strip on a laptop.
 */
type RightPanel = 'tasks' | 'citations'

const rightPanel = ref<RightPanel | null>(null)

const showTodos = computed(() => rightPanel.value === 'tasks')
const showCitations = computed(() => rightPanel.value === 'citations')

function togglePanel(panel: RightPanel) {
  rightPanel.value = rightPanel.value === panel ? null : panel
}

function openPanel(panel: RightPanel) {
  rightPanel.value = panel
}

const ratingBusy = ref<string | null>(null)

const searchOpen = ref(false)
const searchQuery = ref('')
const searchActiveId = ref<string | null>(null)
const searchActiveOccurrence = ref(0)
const searchBarRef = ref<InstanceType<typeof ChatSearchBar> | null>(null)

const mobileConversations = ref(false)

/** Only ever about the thread on screen — another thread may also be busy. */
const busy = computed(() => sending.value || streaming.value)

const messagesContainer = ref<HTMLElement | null>(null)

const { previewDoc, previewWidth, startResize, openExport, closePreview } = useDocumentExport()

/**
 * Files attached from the composer are ordinary uploads: they go through
 * POST /documents and the usual ingestion queue, then retrieval picks them up
 * for this conversation like any other document the user owns.
 */
const attachmentsState = useChatAttachments()

const mainChatEl = ref<HTMLElement | null>(null)

// Reserve a minimum comfortable chat width so the PDF preview resize can never
// cross into the conversation area.
const CHAT_MIN_WIDTH = 400

function previewMaxWidth(): number {
  const chatWidth = mainChatEl.value?.getBoundingClientRect().width ?? 0

  // The chat section and the preview panel are flex siblings, so only their SUM
  // is stable while dragging — see the same guard on the case view.
  return Math.max(chatWidth + previewWidth.value - CHAT_MIN_WIDTH, MIN_PREVIEW_WIDTH)
}

// The preview is the widest panel and is resizable, so it takes the rail rather
// than opening beside it.
watch(previewDoc, (doc) => {
  if (doc) rightPanel.value = null
})

const todoStore = useTodoStore()
const labelStore = useLabelStore()
const billing = useBillingStore()
const auth = useAuthStore()

const experienceLevel = computed(() => auth.user?.kyc_experience_level ?? null)

/**
 * There is no case here, so suggestions lean on the onboarding profile — what
 * the user said they do and what they came to draft — plus the tasks and
 * threads they already have open.
 */
const suggestionContext = computed<SuggestionContext>(() => ({
  openTasks: todoStore.todos
    .filter((t) => t.conversation_id === activeId.value && t.status !== 'completed')
    .map((t) => ({ title: t.title, status: t.status, priority: t.priority, due_hint: t.due_hint })),
  recentThreadTitles: conversations.value
    .filter((c) => c.id !== activeId.value && c.messages_count > 0)
    .map((c) => c.title ?? '')
    .filter(Boolean)
    .slice(0, 3),
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

const activeConversation = computed(
  () => conversations.value.find((c) => c.id === activeId.value) ?? null,
)

/** Tags the thread list is filtered by; empty means show everything. */
const threadFilterTagIds = ref<string[]>([])

async function loadConversations() {
  const params = new URLSearchParams()
  for (const id of threadFilterTagIds.value) params.append('tag_id[]', id)
  const query = params.toString() ? `?${params.toString()}` : ''

  try {
    const { data } = await api<{ data: Conversation[] }>(`/conversations${query}`)
    conversations.value = data
  } catch {
    conversations.value = []
  }
}

watch(threadFilterTagIds, () => {
  void loadConversations()
})

/**
 * Retag the open thread. The picker hands over the whole set it is showing,
 * so this replaces what the thread carried.
 */
async function updateThreadTags(ids: string[]) {
  if (!activeId.value) return

  const conversation = activeConversation.value
  const previous = conversation?.tags ?? []

  if (conversation) {
    conversation.tags = ids
      .map((id) => labelStore.byId.get(id))
      .filter((label): label is NonNullable<typeof label> => label !== undefined)
  }

  try {
    const { data } = await api<{ data: Conversation }>(`/conversations/${activeId.value}`, {
      method: 'PATCH',
      body: { label_ids: ids },
    })
    if (conversation) conversation.tags = data.tags ?? []
  } catch {
    if (conversation) conversation.tags = previous
    toast.error('Could not update the tags')
  }
}

async function loadConversation(id: string) {
  try {
    const { data } = await api<{ data: Conversation }>(`/conversations/${id}`)
    activeId.value = id
    messages.value = data.messages ?? []
    // Any pending intake or partial answer belongs to the thread's live turn,
    // which the store still holds — nothing to reset here.
    await router.replace({ query: { c: id } })
    // The answer may have landed while the user was on another page; this is
    // the moment to finish it off.
    await finalizeTurn(id)
    await nextTick()
    scrollToBottom()
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

// Starting or switching threads is allowed while an answer is still arriving:
// the turn belongs to its own thread and keeps going without this page.
async function startNewChat() {
  activeId.value = null
  messages.value = []
  await router.replace({ query: {} })
}

async function switchConversation(id: string) {
  if (id === activeId.value) return
  await loadConversation(id)
}

async function deleteConversation(id: string) {
  chatStream.discard(id)
  await api(`/conversations/${id}`, { method: 'DELETE' })
  if (activeId.value === id) {
    activeId.value = null
    messages.value = []
    await router.replace({ query: {} })
  }
  await loadConversations()
}

async function maybeCreateTodosFromText(text: string, conversationId: string | null) {
  if (!conversationId || !text) return
  const items = extractTodoItems(text)
  if (items.length === 0) return
  try {
    await todoStore.addTodos(items, conversationId)
    await todoStore.fetchTodos(conversationId)
    openPanel('tasks')
  } catch {
    // Non-critical: todos are a convenience, never block the chat on failure.
  }
}

async function handleIntakeSubmit(data: Record<string, string>) {
  if (!activeId.value) return
  chatStream.clearIntake(activeId.value)
  const formatted = Object.entries(data)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')
  await send(`[Intake Form Submission]\n${formatted}`)
}

function handleIntakeCancel() {
  if (activeId.value) chatStream.dismissIntake(activeId.value)
}

function reopenIntake() {
  if (activeId.value) chatStream.reopenIntake(activeId.value)
}

function abandonIntake() {
  if (activeId.value) chatStream.clearIntake(activeId.value)
}

function getDisplayedContent(msg: Message): string {
  return msg.content
}

function handleMarkdownClick(event: MouseEvent, msg: Message) {
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
  const title = activeConversation.value?.title ?? (type === 'pdf' ? 'PDF Document' : 'Word Document')
  void openExport(msg.content, type, title, msg.template_id ? msg.id : undefined)
}

/**
 * A citation badge in the answer was pressed: open the sources panel on the
 * card it refers to. The badge is the reader's shortest route from "this
 * sentence is sourced" to what the source actually was.
 */
function revealCitation(mark: CitationMark, msg: ChatMessage) {
  const entry = findCitation(collectCitations(thread.value as ChatMessage[]), msg, mark)

  if (entry === null) {
    toast('That source is no longer available')
    return
  }

  openPanel('citations')
  citationTarget.value = { key: entry.key, at: Date.now() }
}

/**
 * Pull the saved thread back down and hand the turn over to it.
 *
 * The refresh and the handover happen in the same tick so the answer never
 * blinks: the saved copy replaces the streamed one in a single render.
 */
async function refreshMessages(id: string, settle = false) {
  try {
    const { data } = await api<{ data: Conversation }>(`/conversations/${id}`)
    // The user may have moved on while the answer was finishing; their current
    // thread must not be overwritten by another one's messages.
    if (activeId.value === id) messages.value = data.messages ?? []
    if (settle) chatStream.settle(id)
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

/**
 * The plan ran out mid-send. Explain why before redirecting, and refresh the
 * subscription first: a trial can end on this very request, and the pricing
 * page would otherwise render its banner from stale state.
 */
async function handleUpgradeRequired(message: string): Promise<boolean> {
  toast.error(message)
  await billing.fetchSubscription()
  await navigateTo('/pricing')

  return true
}

async function send(questionOverride?: string | Event) {
  const question = (typeof questionOverride === 'string' ? questionOverride : input.value).trim()
  if (!question || busy.value) return

  input.value = ''
  // The files travel with this message; the uploads themselves stay in the
  // user's library and remain retrievable for the rest of the conversation.
  const attached = attachmentsState.take()

  const conv = activeConversation.value ?? (await createConversation())
  if (chatStream.isStreaming(conv.id)) return

  // Deliberately not awaited: the answer belongs to the thread from here on,
  // and this page is free to be left, or unmounted, while it arrives.
  void chatStream.start({
    conversationId: conv.id,
    question,
    returnTo: `/chat?c=${conv.id}`,
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
 * watching, and from `loadConversation` when it landed while they were
 * somewhere else — either way the thread ends up in the same state.
 */
const finalizing = new Set<string>()

async function finalizeTurn(id: string) {
  const finished = chatStream.turnFor(id)
  // Both the watcher and `loadConversation` can reach a finished turn, and
  // running the follow-up twice would file the same tasks twice.
  if (!finished?.finishedAt || finalizing.has(id)) return

  finalizing.add(id)

  // A pending intake form or a failed turn still has work left in it, so the
  // turn stays until the user submits, abandons, or retries.
  const keep = finished.intakeFields !== null || finished.error !== ''

  try {
    await loadConversations()

    if (!finished.todoToolCalled) {
      await maybeCreateTodosFromText(finished.assistantMessage?.content ?? '', id)
    }

    await refreshMessages(id, !keep)
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
  () => chatStream.turns[activeId.value ?? '']?.finishedAt ?? null,
  (finishedAt, previous) => {
    if (!finishedAt || finishedAt === previous) return
    if (activeId.value) void finalizeTurn(activeId.value)
  },
)

/** The model filed tasks mid-answer; show them. */
watch(
  () => chatStream.turns[activeId.value ?? '']?.todosUpdatedAt ?? 0,
  (updatedAt) => {
    if (updatedAt) openPanel('tasks')
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

function onGlobalKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    toggleSearch()
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown))

function stopStreaming() {
  if (activeId.value) chatStream.stop(activeId.value)
}

function retryLast() {
  if (!activeId.value || !lastQuestion.value || busy.value) return
  void chatStream.retry(activeId.value, handleUpgradeRequired)
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

watch(thread, async () => {
  if (thread.value.length === 0) return
  await nextTick()
  scrollToBottom()
}, { deep: true })

watch(activeId, async (id) => {
  if (id) {
    await todoStore.fetchTodos(id)
    if (todoStore.todos.some((t) => t.conversation_id === id)) openPanel('tasks')
  } else if (rightPanel.value === 'tasks') {
    rightPanel.value = null
  }
})

// Nothing to tear down: the turn is the store's, and leaving this page is
// exactly the case it exists to survive.
</script>

<template>
  <div class="flex h-[calc(100dvh-3.5rem)] overflow-hidden">
    <ChatConversationList
      v-model:filter-tag-ids="threadFilterTagIds"
      class="hidden md:flex"
      :conversations="conversations"
      :active-id="activeId"
      :streaming-ids="chatStream.streamingIds"
      @new="startNewChat"
      @select="switchConversation"
      @delete="deleteConversation"
    />

    <section
      ref="mainChatEl"
      class="flex min-w-0 flex-1 flex-col"
      :class="previewDoc ? 'lg:min-w-[400px]' : ''"
    >
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
            <div class="min-w-0">
              <p class="truncate text-sm font-medium leading-tight">
                {{ activeConversation?.title || 'New conversation' }}
              </p>
              <p v-if="busy" class="mt-0.5 truncate text-xs text-muted-foreground">
                {{ sending ? 'Creating…' : (statusLabel ?? 'Responding…') }}
              </p>
              <LabelPicker
                v-else-if="activeConversation"
                class="mt-1"
                kind="thread_tag"
                trigger-label="Tag"
                :max="10"
                :model-value="(activeConversation.tags ?? []).map((tag) => tag.id)"
                @update:model-value="updateThreadTags"
              />
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-1 sm:gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              class="gap-1.5 px-2 text-xs sm:px-3"
              :class="{ 'bg-muted text-primary': searchOpen }"
              :aria-pressed="searchOpen"
              @click="toggleSearch"
            >
              <SearchIcon class="size-4" />
              <span class="hidden sm:inline">{{ searchOpen ? 'Close search' : 'Search' }}</span>
            </Button>
            <Button
              v-if="citationCount > 0"
              variant="ghost"
              size="sm"
              class="gap-1.5 px-2 text-xs sm:px-3"
              :class="{ 'bg-muted text-primary': showCitations }"
              :aria-pressed="showCitations"
              @click="togglePanel('citations')"
            >
              <QuoteIcon class="size-4" />
              <span class="hidden sm:inline">{{ showCitations ? 'Hide sources' : 'Sources' }}</span>
              <Badge variant="secondary" class="px-1.5 text-[10px]">{{ citationCount }}</Badge>
            </Button>
            <Button
              v-if="activeConversation"
              variant="ghost"
              size="sm"
              class="gap-1.5 px-2 text-xs sm:px-3"
              :class="{ 'bg-muted text-primary': showTodos }"
              :aria-pressed="showTodos"
              @click="togglePanel('tasks')"
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
        <div ref="messagesContainer" data-tour="chat-sources" class="absolute inset-0 overflow-y-auto">
          <ChatEmptyState
            v-if="thread.length === 0"
            title="Research Philippine law with Batayan"
            description="Ask about statutes, Supreme Court decisions, or your uploaded documents. Answers are grounded in retrieved sources and cited inline."
            eyebrow="Batayan AI"
          >
            <ChatStarters :starters="starters" @select="selectPrompt" />
          </ChatEmptyState>

        <ChatThread
          v-else
          :messages="thread"
          :streaming="streaming"
          :status-label="statusLabel"
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
          :messages="thread"
          @query="searchQuery = $event"
          @navigate="searchNavigate"
          @close="toggleSearch"
        />
      </div>

      <div data-tour="chat-composer" class="border-t px-3 py-3">
        <div class="mx-auto w-full max-w-3xl">
          <ChatComposer
            ref="composerRef"
            v-model="input"
            :disabled="busy"
            :streaming="streaming"
            :attachments="attachmentsState.attachments.value"
            :can-send="!attachmentsState.pending.value"
            placeholder="Ask about Philippine law or your documents…"
            help-context="general"
            @send="send()"
            @stop="stopStreaming"
            @attach="attachmentsState.add"
            @remove-attachment="attachmentsState.remove"
          />
        </div>
      </div>
    </section>

    <TaskPanel
      v-if="showTodos && activeId"
      :conversation-id="activeId"
      @close="rightPanel = null"
    />

    <CitationsPanel
      v-if="showCitations"
      :messages="(thread as ChatMessage[])"
      :target="citationTarget"
      @close="rightPanel = null"
    />

    <!-- Floating Document Preview Panel (Large Screens) -->
    <aside
      v-if="previewDoc"
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
        <div class="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-card shadow-xl">
          <div class="flex h-12 shrink-0 items-center justify-between border-b px-3">
            <span class="text-sm font-semibold">Conversations</span>
            <Button variant="ghost" size="icon" class="size-8" aria-label="Close conversations" @click="mobileConversations = false">
              <XIcon class="size-4" />
            </Button>
          </div>
          <div class="min-h-0 flex-1">
            <ChatConversationList
              v-model:filter-tag-ids="threadFilterTagIds"
              class="h-full w-full border-r-0"
              :conversations="conversations"
              :active-id="activeId"
              :streaming-ids="chatStream.streamingIds"
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
