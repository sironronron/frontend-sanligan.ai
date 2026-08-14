import { defineStore } from 'pinia'
import { authHeaders } from '~/lib/http'
import { upgradeMessage } from '~/stores/billing'
import { useTodoStore } from '~/stores/todos'
import { createTextStreamer, type TextStreamer } from '~/composables/useTextStreamer'
import type { IntakeField } from '~/components/IntakeFormSheet.vue'
import type {
  ChatActivityStep,
  ChatMessage,
  ChatMessageAttachment,
} from '~/types/chat'

/**
 * The in-flight half of a conversation, owned by the store rather than by the
 * page that started it.
 *
 * A turn used to live in `chat.vue`/`cases/[id].vue` as a handful of refs, with
 * the fetch aborted on unmount. Leaving the thread mid-answer therefore killed
 * the generation: the server saw the client disconnect, rolled the user message
 * back, and the answer was gone when the user came back. Here the turn survives
 * navigation — the fetch is never tied to a component — so the thread list can
 * keep showing that Batayan is still writing, and re-opening the thread picks
 * the stream up exactly where it got to.
 */
export interface ChatTurn {
  conversationId: string
  /** The question that opened this turn; also what a retry re-sends. */
  question: string
  /**
   * Where the thread lives, so an indicator anywhere in the app can offer the
   * way back to it. Only the page that started the turn knows this — the same
   * conversation is reached at `/chat?c=…` or inside a case.
   */
  returnTo: string
  userMessage: ChatMessage
  /** Null once an intake form replaces the draft (see `handleToolCall`). */
  assistantMessage: ChatMessage | null
  /**
   * Messages from earlier turns of this conversation that the page has not
   * reloaded from the server yet — an intake round-trip, for instance, starts a
   * second turn before the first one's question has been re-fetched.
   */
  priorMessages: ChatMessage[]
  status: string | null
  statusLabel: string | null
  topic: string | null
  steps: ChatActivityStep[]
  awaitingIntake: boolean
  intakeFields: IntakeField[] | null
  intakeDefaults: Record<string, string> | null
  intakeDismissed: boolean
  error: string
  /** Between send and the first byte of the response. */
  sending: boolean
  streaming: boolean
  /** The model called `create_todo`, so the text fallback must not run. */
  todoToolCalled: boolean
  /** Bumped whenever the store refreshes todos, for pages that open a panel. */
  todosUpdatedAt: number
  startedAt: number
  /** Bumped when the stream ends, however it ended. */
  finishedAt: number | null
}

export interface StartTurnOptions {
  conversationId: string
  question: string
  attachments?: ChatMessageAttachment[]
  /** Route that reopens this thread; see `ChatTurn.returnTo`. */
  returnTo: string
  /**
   * Called when the API refuses the send for plan reasons. Return true if the
   * page handled it (a redirect, say) and no inline error should be shown.
   */
  onUpgrade?: (message: string) => boolean | Promise<boolean>
}

// Fallbacks only — the server sends a label with every status frame. Kept
// short and free of the question's topic: the topic is shown once, as the
// card's heading, rather than repeated on every row beneath it.
const statusLabels: Record<string, string> = {
  checking_sources: 'Checking legal sources',
  searching_web: 'Searching the web',
  composing: 'Writing your answer',
  collecting_facts: 'Collecting the facts I need',
  gathering_facts: 'Gathering the facts needed',
  drafting_document: 'Drafting your document',
  filling_template: 'Filling in your template',
  preparing_next_steps: 'Preparing your next steps',
}

function localMessage(role: 'user' | 'assistant', content: string, attachments?: ChatMessageAttachment[]): ChatMessage {
  return {
    id: `local-${crypto.randomUUID()}`,
    role,
    content,
    sources: [],
    ...(attachments?.length ? { attachments } : {}),
    created_at: new Date().toISOString(),
  }
}

export const useChatStreamStore = defineStore('chatStream', () => {
  const {
    public: { apiBase },
  } = useRuntimeConfig()

  const turns = ref<Record<string, ChatTurn>>({})

  // Deliberately outside the reactive state: an AbortController and a
  // requestAnimationFrame loop are machinery, not something a template renders.
  const controllers = new Map<string, AbortController>()
  const streamers = new Map<string, TextStreamer>()

  /** Turns still producing an answer, oldest first. */
  const streamingTurns = computed(() =>
    Object.values(turns.value)
      .filter((turn) => turn.sending || turn.streaming)
      .sort((a, b) => a.startedAt - b.startedAt),
  )

  /** Conversation ids whose answer is still being produced. */
  const streamingIds = computed(() => streamingTurns.value.map((turn) => turn.conversationId))

  const anyStreaming = computed(() => streamingIds.value.length > 0)

  function turnFor(conversationId: string | null | undefined): ChatTurn | null {
    if (!conversationId) return null

    return turns.value[conversationId] ?? null
  }

  function isStreaming(conversationId: string | null | undefined): boolean {
    const turn = turnFor(conversationId)

    return turn !== null && (turn.sending || turn.streaming)
  }

  /** The messages a turn contributes to the thread, in order. */
  function turnMessages(turn: ChatTurn): ChatMessage[] {
    return [
      ...turn.priorMessages,
      turn.userMessage,
      ...(turn.assistantMessage ? [turn.assistantMessage] : []),
    ]
  }

  /**
   * The thread as the user should see it: what the server has, plus whatever
   * this turn is still producing.
   *
   * The server persists the user message before it starts streaming, so a page
   * that re-fetches a conversation mid-answer gets that message back while the
   * turn still holds its own optimistic copy. Anything the server already knows
   * about is dropped from the turn's side rather than rendered twice.
   */
  function threadFor(conversationId: string | null | undefined, serverMessages: ChatMessage[]): ChatMessage[] {
    const turn = turnFor(conversationId)
    if (!turn) return serverMessages

    const pending = turnMessages(turn).filter(
      (local) => !serverMessages.some((saved) => saved.role === local.role && saved.content === local.content),
    )

    return pending.length > 0 ? [...serverMessages, ...pending] : serverMessages
  }

  function resetSteps(turn: ChatTurn) {
    turn.steps = []
  }

  function markStepActive(turn: ChatTurn, key: string, label: string) {
    const existing = turn.steps.find((step) => step.key === key)

    if (existing) {
      existing.state = 'active'

      return
    }

    turn.steps.push({ key, label, state: 'active' })
  }

  function completeStep(turn: ChatTurn, key: string) {
    const existing = turn.steps.find((step) => step.key === key)

    if (existing) existing.state = 'done'
  }

  function completeActiveSteps(turn: ChatTurn) {
    for (const step of turn.steps) {
      if (step.state === 'active') step.state = 'done'
    }
  }

  function handleToolCall(turn: ChatTurn, payload: Record<string, any>) {
    if (payload.name !== 'request_intake_form' || !Array.isArray(payload.arguments?.fields)) return

    turn.intakeFields = payload.arguments.fields as IntakeField[]
    turn.intakeDefaults = payload.arguments.default_values ?? null
    turn.awaitingIntake = true
    turn.intakeDismissed = false
    completeActiveSteps(turn)
    markStepActive(turn, 'request_intake_form', 'Collecting facts from you')
    // The document is drafted only after the intake form is submitted. Drop
    // the streaming bubble so no partial draft appears before the form.
    turn.assistantMessage = null
  }

  function handleFrame(turn: ChatTurn, frame: string) {
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

    const target = turn.assistantMessage

    if (event === 'status' && typeof payload.status === 'string') {
      completeActiveSteps(turn)
      turn.status = payload.status
      // Resolved here rather than in each page: the server sends a label with
      // every status frame, and the map only covers the frames that predate it.
      turn.statusLabel = typeof payload.label === 'string' && payload.label !== ''
        ? payload.label
        : (statusLabels[payload.status] ?? payload.status)
      if (typeof payload.topic === 'string' && payload.topic !== '') turn.topic = payload.topic

      if (payload.status === 'collecting_facts') {
        turn.awaitingIntake = true
        markStepActive(turn, 'collecting_facts', 'Collecting the facts I need')
      } else {
        markStepActive(turn, payload.status, turn.statusLabel)
      }
    } else if (event === 'delta' && typeof payload.delta === 'string') {
      const streamer = streamers.get(turn.conversationId)
      if (streamer) streamer.push(payload.delta)
      else if (target) target.content += payload.delta
      turn.awaitingIntake = false
      completeStep(turn, 'composing')
    } else if (event === 'citation' && typeof payload.url === 'string' && target) {
      const existing = target.sources.find((s) => s.type === 'web' && s.url === payload.url)

      if (!existing) {
        target.sources.push({
          type: 'web',
          index: Number.isFinite(Number(payload.index))
            ? Number(payload.index)
            : target.sources.filter((s) => s.type === 'web').length + 1,
          label: typeof payload.title === 'string' ? payload.title : null,
          title: typeof payload.title === 'string' ? payload.title : null,
          url: payload.url,
          domain: typeof payload.domain === 'string' ? payload.domain : null,
          excerpt: typeof payload.excerpt === 'string' ? payload.excerpt : undefined,
        })
      }
    } else if (event === 'tool_call') {
      handleToolCall(turn, payload)
    } else if (event === 'tool_result' && payload.name === 'create_todo') {
      turn.todoToolCalled = true
      void refreshTodos(turn)
      completeStep(turn, 'create_todo')
    } else if (event === 'done') {
      streamers.get(turn.conversationId)?.flush()
      completeActiveSteps(turn)
      if (turn.intakeFields === null) turn.awaitingIntake = false
    } else if (event === 'error') {
      streamers.get(turn.conversationId)?.flush()
      turn.error = String(payload.message ?? 'The AI provider could not complete the response.')
      turn.awaitingIntake = false
    }
  }

  async function refreshTodos(turn: ChatTurn) {
    try {
      await useTodoStore().fetchTodos(turn.conversationId)
      turn.todosUpdatedAt = Date.now()
    } catch {
      // Todos are a convenience; never let them break the answer.
    }
  }

  /**
   * Send a message and stream the answer.
   *
   * Resolves when the stream ends, but nothing needs to await it: the turn is
   * reactive state, and pages react to `finishedAt` instead. That is what lets
   * the caller be unmounted halfway through without stopping the answer.
   */
  async function start(options: StartTurnOptions): Promise<void> {
    const { conversationId, question, returnTo, attachments = [], onUpgrade } = options
    const trimmed = question.trim()
    if (trimmed === '') return
    if (isStreaming(conversationId)) return

    const previous = turns.value[conversationId] ?? null

    const turn: ChatTurn = {
      conversationId,
      question: trimmed,
      returnTo,
      userMessage: localMessage('user', trimmed, attachments),
      assistantMessage: localMessage('assistant', ''),
      priorMessages: previous ? turnMessages(previous) : [],
      status: null,
      statusLabel: null,
      topic: null,
      steps: [],
      awaitingIntake: false,
      intakeFields: null,
      intakeDefaults: null,
      intakeDismissed: false,
      error: '',
      sending: true,
      streaming: false,
      todoToolCalled: false,
      todosUpdatedAt: 0,
      startedAt: Date.now(),
      finishedAt: null,
    }

    turns.value[conversationId] = turn
    // Read back through the store so every mutation below goes through Vue's
    // reactive proxy rather than the raw object literal.
    const live = turns.value[conversationId] as ChatTurn

    resetSteps(live)

    if (trimmed.startsWith('[Intake Form Submission]') || trimmed.startsWith('[Template:')) {
      markStepActive(live, 'drafting', 'Drafting your document')
    }

    const streamer = createTextStreamer((chunk) => {
      if (live.assistantMessage) live.assistantMessage.content += chunk
    })
    streamers.set(conversationId, streamer)

    const controller = new AbortController()
    controllers.set(conversationId, controller)

    live.streaming = true

    try {
      const response = await fetch(`${apiBase}/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: await authHeaders({
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        }),
        body: JSON.stringify({
          message: trimmed,
          attachment_ids: attachments.map((a) => a.id),
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        const upgrade = upgradeMessage({ status: response.status, data: body })

        if (upgrade && onUpgrade && (await onUpgrade(upgrade))) {
          live.error = ''

          return
        }

        throw new Error(upgrade ?? body?.message ?? 'Something went wrong while streaming the response.')
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

        for (const frame of frames) handleFrame(live, frame)
      }

      if (buffer.trim()) handleFrame(live, buffer)

      streamer.flush()
    } catch (err: any) {
      streamer.flush()

      // A stop is a choice, not a failure: keep whatever was written and say
      // nothing about it.
      live.error = err?.name === 'AbortError'
        ? ''
        : (err?.message ?? 'Something went wrong while streaming the response.')
    } finally {
      // Only clear this turn's machinery. A discarded turn can be replaced by a
      // fresh one before its own fetch unwinds, and that one still needs its
      // controller to be stoppable.
      if (streamers.get(conversationId) === streamer) streamers.delete(conversationId)
      if (controllers.get(conversationId) === controller) controllers.delete(conversationId)
      live.sending = false
      live.streaming = false
      live.status = null
      live.statusLabel = null
      live.finishedAt = Date.now()
    }
  }

  /** Stop generating, keeping the text produced so far. */
  function stop(conversationId: string) {
    const turn = turnFor(conversationId)
    if (!turn) return

    streamers.get(conversationId)?.flush()
    controllers.get(conversationId)?.abort()
    controllers.delete(conversationId)
    turn.status = null
    turn.statusLabel = null
    turn.awaitingIntake = false
    turn.error = ''
  }

  /**
   * Re-send the turn's question, discarding the failed attempt's messages.
   */
  async function retry(conversationId: string, onUpgrade?: StartTurnOptions['onUpgrade']): Promise<void> {
    const turn = turnFor(conversationId)
    if (!turn || turn.streaming || turn.sending) return

    const { question, returnTo } = turn
    // Dropped rather than carried: the failed exchange is being replaced, not
    // appended to.
    delete turns.value[conversationId]

    await start({ conversationId, question, returnTo, onUpgrade })
  }

  /**
   * Forget a turn. Called once the page has reloaded the conversation from the
   * server, which is the point at which the optimistic copy is redundant.
   */
  function settle(conversationId: string) {
    const turn = turnFor(conversationId)
    if (!turn || turn.streaming || turn.sending) return

    streamers.get(conversationId)?.stop()
    streamers.delete(conversationId)
    controllers.delete(conversationId)
    delete turns.value[conversationId]
  }

  /**
   * Abandon a turn outright, running or not — the conversation it belongs to is
   * going away.
   */
  function discard(conversationId: string) {
    streamers.get(conversationId)?.stop()
    streamers.delete(conversationId)
    controllers.get(conversationId)?.abort()
    controllers.delete(conversationId)
    delete turns.value[conversationId]
  }

  function dismissIntake(conversationId: string) {
    const turn = turnFor(conversationId)
    if (!turn) return

    // Keep the pending intake fields so the user can reopen the form, but stop
    // the "waiting" bubble and surface a dismiss/fill-requirement prompt instead.
    turn.intakeDismissed = true
    turn.awaitingIntake = false
  }

  function reopenIntake(conversationId: string) {
    const turn = turnFor(conversationId)
    if (!turn) return

    turn.intakeDismissed = false
    turn.awaitingIntake = true
  }

  function clearIntake(conversationId: string) {
    const turn = turnFor(conversationId)
    if (!turn) return

    turn.intakeFields = null
    turn.intakeDefaults = null
    turn.awaitingIntake = false
    turn.intakeDismissed = false
  }

  function clearError(conversationId: string) {
    const turn = turnFor(conversationId)
    if (turn) turn.error = ''
  }

  return {
    turns,
    streamingTurns,
    streamingIds,
    anyStreaming,
    turnFor,
    isStreaming,
    threadFor,
    start,
    stop,
    retry,
    settle,
    discard,
    dismissIntake,
    reopenIntake,
    clearIntake,
    clearError,
  }
})
