<script setup lang="ts">
import { toast } from 'vue-sonner'
import {
  ExternalLinkIcon,
  FileIcon,
  Loader2Icon,
  ScaleIcon,
  SendIcon,
  SparklesIcon,
  TrashIcon,
  XIcon,
  DownloadIcon,
  ListChecksIcon,
  CheckIcon,
  ClipboardCheckIcon,
  FileTextIcon,
} from '@lucide/vue'
import { ensureCsrfCookie, getXsrfToken } from '~/lib/http'
import { useTodoStore } from '~/stores/todos'
import IntakeFormSheet from '~/components/IntakeFormSheet.vue'
import TaskPanel from '~/components/TaskPanel.vue'
import type { IntakeField } from '~/components/IntakeFormSheet.vue'

definePageMeta({
  middleware: 'auth',
})

interface Source {
  type: 'legal' | 'document'
  label: string
  law_name?: string | null
  gr_number?: string | null
  promulgation_date?: string | null
  source_name?: string | null
  url?: string | null
  title?: string | null
  excerpt?: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  provider?: string | null
  sources: Source[]
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
const currentStatus = ref<string | null>(null)
const lastQuestion = ref('')
let messageStartIndex = -1

const busy = computed(() => sending.value || streaming.value)

const messagesContainer = ref<HTMLElement | null>(null)

const { previewDoc, openExport, closePreview } = useDocumentExport()

const todoStore = useTodoStore()
const showTodos = ref(false)
const intakeFields = ref<IntakeField[] | null>(null)
const awaitingIntake = ref(false)
const todoToolCalled = ref(false)

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
    awaitingIntake.value = false
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
  awaitingIntake.value = false
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
    markStepActive(payload.status, statusLabels[payload.status] ?? payload.status)
  } else if (event === 'delta' && typeof payload.delta === 'string') {
    target.content += payload.delta
    currentStatus.value = null
    completeStep('composing')
  } else if (event === 'tool_call') {
    handleToolCall(payload, target)
  } else if (event === 'tool_result' && payload.name === 'create_todo') {
    todoToolCalled.value = true
    refreshTodos()
    completeStep('create_todo')
  } else if (event === 'done') {
    completeActiveSteps()
  } else if (event === 'error') {
    streamError.value = String(payload.message ?? 'The AI provider could not complete the response.')
  }
}

function handleToolCall(payload: Record<string, any>, target: Message) {
  if (payload.name === 'request_intake_form' && Array.isArray(payload.arguments?.fields)) {
    intakeFields.value = payload.arguments.fields as IntakeField[]
    awaitingIntake.value = true
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
  const regex = /^\s*[-*]\s+\[( |x|X)\]\s+(.+)$/gm
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
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
  awaitingIntake.value = false
  const formatted = Object.entries(data)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')
  await send(`[Intake Form Submission]\n${formatted}`)
}

function handleIntakeCancel() {
  intakeFields.value = null
  awaitingIntake.value = false
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

const displayedLengths = ref<Record<string, number>>({})
let typewriterInterval: ReturnType<typeof setInterval> | null = null

function startTypewriter() {
  if (typewriterInterval) return
  typewriterInterval = setInterval(() => {
    for (const msg of messages.value) {
      if (msg.role === 'assistant' && msg.content.length > 0) {
        const current = displayedLengths.value[msg.id] ?? 0
        if (current < msg.content.length) {
          displayedLengths.value[msg.id] = Math.min(current + 2, msg.content.length)
        }
      }
    }
  }, 20)
}

function stopTypewriter() {
  if (typewriterInterval) {
    clearInterval(typewriterInterval)
    typewriterInterval = null
  }
  for (const msg of messages.value) {
    if (msg.role === 'assistant') {
      displayedLengths.value[msg.id] = msg.content.length
    }
  }
}

function getDisplayedContent(msg: Message): string {
  if (msg.role !== 'assistant') return msg.content
  const isStreaming = streaming.value && msg.id === messages.value[messages.value.length - 1]?.id
  if (!isStreaming) return msg.content
  const len = displayedLengths.value[msg.id]
  if (len === undefined) return msg.content
  return msg.content.slice(0, len)
}

function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  html = html.replace(/^\s*\[\[DOCUMENT_START\]\]\s*$/gm, '')
  html = html.replace(/^\s*\[\[DOCUMENT_END\]\]\s*$/gm, '')

  html = html.replace(/\[Download as (Word|PDF)\]\(\/api\/messages\/([^)]+)\/export\/(word|pdf)\)/g,
    '<a href="#" data-export-url="#" data-export-type="$3" class="inline-flex items-center gap-1.5 rounded-md border bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"><svg class="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>Preview as $1</a>'
  )

  html = html.replace(/^### (.+)$/gm, '<h3 class="mt-4 mb-2 text-base font-semibold">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2 class="mt-5 mb-2 text-lg font-bold">$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1 class="mt-6 mb-2 text-xl font-bold">$1</h1>')

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/`(.+?)`/g, '<code class="rounded bg-muted px-1.5 py-0.5 text-xs">$1</code>')

  html = html.replace(/^\- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
  html = html.replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal">$2</li>')

  html = html.replace(/\n{2,}/g, '</p><p class="mt-2">')
  html = html.replace(/\n/g, '<br>')

  return `<p>${html}</p>`
}

const statusLabel = computed(() => {
  if (!currentStatus.value) return null
  return statusLabels[currentStatus.value] ?? currentStatus.value
})

function parseUrl(url: string): { hostname: string; pathname: string } {
  try {
    const parsed = new window.URL(url)
    return { hostname: parsed.hostname, pathname: parsed.pathname }
  } catch {
    return { hostname: url, pathname: '' }
  }
}

function handleExportClick(event: MouseEvent, msg: Message) {
  const target = event.target as HTMLElement
  const link = target.closest('a[data-export-url]')
  if (link) {
    event.preventDefault()
    const type = (link.getAttribute('data-export-type') as 'word' | 'pdf') ?? 'word'
    const title = activeConversation.value?.title ?? (type === 'pdf' ? 'PDF Document' : 'Word Document')
    void openExport(msg.content, type, title)
  }
}

async function send(questionOverride?: string | Event) {
  const question = (typeof questionOverride === 'string' ? questionOverride : input.value).trim()
  if (!question || sending.value) return

  messageStartIndex = messages.value.length
  lastQuestion.value = question
  sending.value = true
  streamError.value = ''
  currentStatus.value = null
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
    startTypewriter()

    await nextTick()
    scrollToBottom()

    await ensureCsrfCookie(apiBase)

    const response = await fetch(`${apiBase}/api/conversations/${conv.id}/messages`, {
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
      throw new Error(errBody?.message ?? 'The request failed')
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
    streamError.value = err?.message ?? 'Something went wrong while streaming the response.'
  } finally {
    stopTypewriter()
    currentStatus.value = null
    streaming.value = false
    sending.value = false

    if (activeId.value && intakeFields.value === null) {
      await loadConversation(activeId.value)
    }
    await loadConversations()
    await maybeCreateTodosFromText(lastAssistantText, activeId.value)
    await nextTick()
    scrollToBottom()
  }
}

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
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

onMounted(async () => {
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
    showTodos.value = todoStore.todos.length > 0
  } else {
    todoStore.todos = []
    showTodos.value = false
  }
})
</script>

<template>
  <div class="flex h-[calc(100dvh-3.5rem)] overflow-hidden">
    <aside class="flex w-72 shrink-0 flex-col border-r bg-muted/30">
      <div class="flex items-center gap-2 border-b p-3">
        <Button class="flex-1" variant="outline" @click="startNewChat">
          <span class="text-sm">New chat</span>
        </Button>
      </div>

      <ScrollArea class="flex-1">
        <div class="space-y-1 p-2">
          <div
            v-for="c in conversations"
            :key="c.id"
            class="group flex w-full items-center gap-1 rounded-lg transition-colors"
            :class="c.id === activeId ? 'bg-muted' : 'hover:bg-muted/60'"
          >
            <button
              class="min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-left text-sm"
              @click="switchConversation(c.id)"
            >
              {{ c.title || 'New conversation' }}
            </button>
            <button
              class="mr-1 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              @click.stop="deleteConversation(c.id)"
            >
              <TrashIcon class="size-3.5" />
            </button>
          </div>
          <p v-if="conversations.length === 0" class="px-3 py-6 text-center text-sm text-muted-foreground">
            No conversations yet
          </p>
        </div>
      </ScrollArea>
    </aside>

    <section class="flex min-w-0 flex-1 flex-col">
      <div class="flex items-center justify-between border-b px-4 py-2.5">
        <span class="text-xs text-muted-foreground">
          {{ sending ? 'Creating…' : streaming ? (statusLabel ?? 'Responding…') : (activeConversation ? 'Ready' : 'New conversation') }}
        </span>
        <Button
          v-if="activeConversation"
          variant="ghost"
          size="sm"
          class="gap-1.5 text-xs"
          :class="{ 'text-primary': showTodos }"
          @click="showTodos = !showTodos"
        >
          <ListChecksIcon class="size-4" />
          <span>{{ showTodos ? 'Hide tasks' : 'Tasks' }}</span>
          <Badge v-if="todoStore.todos.length > 0" variant="secondary" class="px-1.5 text-[10px]">
            {{ todoStore.todos.length }}
          </Badge>
        </Button>
      </div>

      <div ref="messagesContainer" class="flex-1 overflow-y-auto">
        <div v-if="messages.length === 0" class="flex h-full flex-col items-center justify-center px-6 text-center">
          <div class="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10">
            <ScaleIcon class="size-6 text-primary" />
          </div>
          <h2 class="text-lg font-semibold">Research Philippine law with Saligan.AI</h2>
          <p class="mt-1 max-w-md text-sm text-muted-foreground">
            Ask about statutes, Supreme Court decisions, or your uploaded documents. Answers are
            grounded in retrieved sources and cited inline.
          </p>
          <div class="mt-6 grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-3">
            <Button variant="outline" class="justify-start text-left" @click="input = 'What is the scope of the Comprehensive Agrarian Reform Program?'">
              <SparklesIcon class="size-4 text-primary" />
              <span class="truncate text-xs">Agrarian reform scope</span>
            </Button>
            <Button variant="outline" class="justify-start text-left" @click="input = 'Summarize the ruling in G.R. No. 143491.'">
              <ScaleIcon class="size-4 text-primary" />
              <span class="truncate text-xs">Summarize a ruling</span>
            </Button>
            <Button variant="outline" class="justify-start text-left" @click="input = 'Compare RA 6657 with my uploaded documents.'">
              <FileIcon class="size-4 text-primary" />
              <span class="truncate text-xs">Compare my documents</span>
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
                v-if="m.role === 'assistant' && streaming && m.id === messages[messages.length - 1]?.id && !m.content && statusLabel"
                class="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-transparent"
              >
                <span class="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span class="size-1.5 animate-pulse rounded-full bg-primary" />
                  {{ statusLabel }}
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
                <div v-else class="prose-invert break-words" v-html="renderMarkdown(getDisplayedContent(m))" @click="handleExportClick($event, m)" /><span v-if="streaming && m.id === messages[messages.length - 1]?.id" class="ml-0.5 inline-block h-[1em] w-[3px] animate-pulse rounded-sm bg-primary align-text-bottom" aria-hidden="true" />
              </div>

              <div v-if="m.role === 'assistant' && !m.id.startsWith('local-') && m.content.trim() && m.content.includes('/export/')" class="mt-1 flex items-center gap-1.5">
                <span class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Export</span>
                <Button variant="outline" size="sm" class="h-7 gap-1.5 px-2.5 text-xs" @click="openExport(m.content, 'word', activeConversation?.title ?? 'Word Document')">
                  <FileTextIcon class="size-3.5" />
                  Word
                </Button>
                <Button variant="outline" size="sm" class="h-7 gap-1.5 px-2.5 text-xs" @click="openExport(m.content, 'pdf', activeConversation?.title ?? 'PDF Document')">
                  <FileTextIcon class="size-3.5" />
                  PDF
                </Button>
              </div>

              <div v-if="m.sources.length > 0" class="w-full max-w-[85%] space-y-1.5">
                <p class="text-xs font-medium text-muted-foreground">Sources</p>
                <div
                  v-for="(source, index) in m.sources"
                  :key="`${source.label}-${index}`"
                  class="rounded-lg border bg-card p-3"
                >
                  <div class="flex items-start gap-2">
                    <Badge variant="secondary" class="mt-0.5 h-5 shrink-0 text-[10px]">
                      {{ source.type === 'legal' ? 'LEGAL' : 'DOCUMENT' }}
                    </Badge>
                    <div class="min-w-0 flex-1">
                      <p class="text-sm font-medium leading-tight">{{ source.label }}</p>
                      <p v-if="source.title && source.title !== source.label" class="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                        {{ source.title }}
                      </p>
                      <a
                        v-if="source.url"
                        :href="source.url"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                      >
                        <ExternalLinkIcon class="size-3" />
                        {{ parseUrl(source.url).hostname }}{{ parseUrl(source.url).pathname.length > 1 ? parseUrl(source.url).pathname : '' }}
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
                <span class="shining-text font-medium">Needed more information from you</span>
                <span class="flex items-center gap-1">
                  <span class="waiting-dot" />
                  <span class="waiting-dot" style="animation-delay: 0.15s" />
                  <span class="waiting-dot" style="animation-delay: 0.3s" />
                </span>
              </div>
              <ActivityTimeline v-if="activitySteps.length > 0" :steps="activitySteps" class="mt-3" />
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
            placeholder="Ask about Philippine law or your documents…"
            :disabled="busy"
            @keydown.enter.exact.prevent="send()"
          />
          <Button type="submit" size="icon" :disabled="!input.trim() || busy">
            <Loader2Icon v-if="busy" class="size-4 animate-spin" />
            <SendIcon v-else class="size-4" />
            <span class="sr-only">Send</span>
          </Button>
        </form>
      </div>
    </section>

    <TaskPanel v-if="showTodos && activeId" :conversation-id="activeId" />

    <!-- Floating Document Preview Panel (Large Screens) -->
    <aside
      v-if="previewDoc"
      class="hidden lg:flex w-[450px] shrink-0 flex-col border-l bg-background"
    >
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
      v-if="intakeFields"
      :fields="intakeFields"
      @submit="handleIntakeSubmit"
      @cancel="handleIntakeCancel"
    />
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
