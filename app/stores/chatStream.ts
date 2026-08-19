import { defineStore } from 'pinia'
import { authHeaders } from '~/lib/http'
import { upgradeMessage } from '~/stores/billing'
import { useTodoStore } from '~/stores/todos'
import { useAdvisoryStore } from '~/stores/advisories'
import { useLetterDraftPanel } from '~/composables/useLetterDraftPanel'
import { createTextStreamer, type TextStreamer } from '~/composables/useTextStreamer'
import type { IntakeField } from '~/components/chat/ChatIntakeForm.vue'
import type { ChoiceQuestion } from '~/components/chat/ChatChoicePrompt.vue'
import type {
  ChatActivityStep,
  ChatMessage,
  ChatMessageAttachment,
  ChatToolNotice,
  ChatToolReceipt,
  ChatWebSearch,
  ChatWebSource,
} from '~/types/chat'
import type { LetterDraftPayload, TiptapDoc } from '~/types/tiptap'

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
  /**
   * What the user has typed into the form so far.
   *
   * Held on the turn rather than inside the form component, which unmounts the
   * moment the form is dismissed — closing it to re-read the conversation used
   * to throw away everything already entered. It also survives navigating away
   * from the thread and back, since the turn does.
   */
  intakeDraft: Record<string, string>
  intakeDismissed: boolean
  /**
   * The decisions the model put to the user, held until they answer. Unlike the
   * intake form these render inline under the reply, so whatever the model said
   * before asking stays on screen — and they outlive the stream, which ends the
   * moment the question is asked.
   */
  choiceQuestions: ChoiceQuestion[] | null
  error: string
  /** Between send and the first byte of the response. */
  sending: boolean
  streaming: boolean
  /** The model called `create_todo`, so the text fallback must not run. */
  todoToolCalled: boolean
  /**
   * The search happening right now, or null between searches. Deliberately not
   * a history: the trail is what is being read at this moment, and the sources
   * that survive into the answer become citation cards instead.
   */
  webSearch: ChatWebSearch | null
  /**
   * Corrections raised against the finished reply. They also land on the
   * persisted message, so these are only for the window between the stream
   * ending and the thread being re-fetched.
   */
  notices: ChatToolNotice[]
  /**
   * What this turn actually wrote — tasks filed, points flagged. Shown under
   * the answer as confirmation, and sourced from the tool results rather than
   * from anything the reply says about itself.
   */
  receipts: ChatToolReceipt[]
  /**
   * The letter this turn is drafting or drafted, so the thread can offer the
   * editor back even while the answer is still streaming — after the turn
   * settles it is persisted on the assistant message and this copy is dropped.
   */
  letterDraft: LetterDraftPayload | null
  /** Bumped whenever the store refreshes todos, for pages that open a panel. */
  todosUpdatedAt: number
  /** Bumped when the model flags caveats, so the review pill can appear live. */
  advisoriesUpdatedAt: number
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
  awaiting_choice: 'Waiting for your choice',
  drafting_document: 'Drafting your document',
  filling_template: 'Filling in your template',
  preparing_next_steps: 'Preparing your next steps',
  reviewing_gaps: 'Flagging what to watch out for',
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
    if (payload.name === 'ask_user_question') {
      if (!Array.isArray(payload.arguments?.questions) || payload.arguments.questions.length === 0) return

      turn.choiceQuestions = payload.arguments.questions as ChoiceQuestion[]
      completeActiveSteps(turn)
      markStepActive(turn, 'ask_user_question', 'Waiting for your choice')
      // The reply that led up to the question is kept: the options are a
      // continuation of it, not a replacement for it.
      return
    }

    if (payload.name === 'draft_letter') {
      // The agent started drafting a letter. Open the shared editor panel
      // right away in its "Drafting…" state; the letter_draft event fills it
      // in a moment later with the finished document. The draft is also kept
      // on the turn so a user who closed the panel can reopen it mid-stream.
      turn.letterDraft = { content: null, title: null, drafting: true }
      useLetterDraftPanel().beginLetterDraft()
      return
    }

    if (payload.name !== 'request_intake_form' || !Array.isArray(payload.arguments?.fields)) return

    // An empty form is a dead end: it opens with nothing to answer and the
    // submit button sends back no facts.
    if (payload.arguments.fields.length === 0) return

    // One form per turn. A second frame would re-open the sheet on top of the
    // answers the user just gave and drop the draft below it — the server
    // suppresses repeats, and this keeps a stale client honest too.
    if (turn.intakeFields !== null) return

    turn.intakeFields = payload.arguments.fields as IntakeField[]
    turn.intakeDefaults = payload.arguments.default_values ?? null
    turn.intakeDraft = {}
    turn.awaitingIntake = true
    turn.intakeDismissed = false
    completeActiveSteps(turn)
    markStepActive(turn, 'request_intake_form', 'Collecting facts from you')
    // The document is drafted only after the intake form is submitted. Drop
    // the streaming bubble so no partial draft appears before the form.
    turn.assistantMessage = null
  }

  /**
   * Merge one phase of the delegated web search into the turn's live trail.
   *
   * The phases arrive in order but not necessarily one per frame — a search is
   * a single blocking tool call, so `reading`, `read`, and `done` can land
   * together the moment the model resumes. Rows are therefore merged by url
   * rather than replaced, and the reveal animation is the client's own
   * (`ChatWebSearchTrail` staggers them), which keeps the trail readable
   * whether the frames trickle or arrive as a batch.
   */
  function handleWebSearch(turn: ChatTurn, payload: Record<string, any>) {
    const phase = payload.phase

    if (phase === 'start') {
      turn.webSearch = {
        query: typeof payload.query === 'string' ? payload.query : '',
        sources: [],
        phase: 'start',
      }

      return
    }

    if (phase === 'done') {
      // Cleared, not kept: these are the sites that were read, and the ones
      // the answer actually leans on are already citation cards. Leaving the
      // trail up would read as a second, contradictory source list.
      turn.webSearch = null

      return
    }

    if (!turn.webSearch || !Array.isArray(payload.sources)) return

    const search = turn.webSearch

    for (const raw of payload.sources) {
      if (typeof raw?.url !== 'string' || raw.url === '') continue

      const source: ChatWebSource = {
        url: raw.url,
        domain: typeof raw.domain === 'string' ? raw.domain : null,
        title: typeof raw.title === 'string' && raw.title !== '' ? raw.title : null,
        index: Number.isFinite(Number(raw.index)) ? Number(raw.index) : null,
      }

      const existing = search.sources.find((s) => s.url === source.url)

      if (!existing) {
        search.sources.push(source)
        continue
      }

      // A later phase only ever adds detail — the title the page turned out to
      // have, the number the card was given — so nothing already known is
      // overwritten with a null.
      existing.title ??= source.title
      existing.index ??= source.index
      existing.domain ??= source.domain
    }

    search.phase = phase === 'read' ? 'read' : 'reading'
  }

  /**
   * Drop `[Web N]` markers the answer has no source for.
   *
   * The persisted copy is cleaned server-side, but the text this client
   * streamed is whatever the model wrote, so a marker numbered past the
   * sources that came back would sit in the answer as a badge that resolves to
   * nothing. Applied once, when the turn ends and the final count is known.
   */
  function dropUnsupportedWebMarkers(turn: ChatTurn, count: number) {
    const target = turn.assistantMessage
    if (!target || !target.content.includes('[Web ')) return

    target.content = target.content.replace(
      /\s*\[Web\s+(\d+)\]/gi,
      (match, index: string) => (Number(index) >= 1 && Number(index) <= count ? match : ''),
    )
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
    } else if (event === 'web_search') {
      handleWebSearch(turn, payload)
    } else if (event === 'notice' && typeof payload.message === 'string') {
      if (!turn.notices.some((n) => n.kind === payload.kind)) {
        turn.notices.push({ kind: String(payload.kind ?? 'notice'), message: payload.message })
      }
    } else if (event === 'tool_call') {
      handleToolCall(turn, payload)
    } else if (event === 'letter_draft' && payload.content && payload.content.type === 'doc') {
      // The draft_letter tool finished and the document is ready. Fill the
      // shared letter editor panel (opened on the tool call) so the user can
      // edit, sign, save, and export it. messageId is where edits are saved.
      const draft: LetterDraftPayload = {
        content: payload.content as TiptapDoc,
        title: typeof payload.title === 'string' && payload.title !== '' ? payload.title : null,
        messageId: typeof payload.message_id === 'string' ? payload.message_id : null,
      }
      turn.letterDraft = draft
      useLetterDraftPanel().fillLetterDraft(draft)
    } else if (event === 'tool_result' && payload.name === 'create_todo') {
      // The frame is a signal and a count, never the tool's own payload: the
      // todos themselves come back from the endpoint that owns them.
      turn.todoToolCalled = true
      recordReceipt(turn, 'tasks', payload.count)
      void refreshTodos(turn)
      completeStep(turn, 'create_todo')
    } else if (event === 'tool_result' && payload.name === 'flag_advisories') {
      recordReceipt(turn, 'advisories', payload.count)
      void refreshAdvisories(turn)
      completeStep(turn, 'flag_advisories')
    } else if (event === 'done') {
      streamers.get(turn.conversationId)?.flush()
      completeActiveSteps(turn)
      turn.webSearch = null
      if (Number.isFinite(Number(payload.web_citations))) {
        dropUnsupportedWebMarkers(turn, Number(payload.web_citations))
      }
      if (turn.intakeFields === null) turn.awaitingIntake = false
    } else if (event === 'error') {
      streamers.get(turn.conversationId)?.flush()
      turn.error = String(payload.message ?? 'The AI provider could not complete the response.')
      turn.awaitingIntake = false
      turn.webSearch = null
      // A failed turn's question, if one was asked, is unanswerable: the retry
      // starts the turn over.
      turn.choiceQuestions = null
    }
  }

  /**
   * Note what a tool wrote, merging with anything the same tool already
   * reported this turn — the server's own fallback can file tasks after the
   * tool did, and two separate receipts would read as two separate batches.
   */
  function recordReceipt(turn: ChatTurn, kind: ChatToolReceipt['kind'], count: unknown) {
    const written = Number(count)
    if (!Number.isFinite(written) || written <= 0) return

    const existing = turn.receipts.find((receipt) => receipt.kind === kind)

    if (existing) existing.count += written
    else turn.receipts.push({ kind, count: written })
  }

  async function refreshTodos(turn: ChatTurn) {
    try {
      await useTodoStore().fetchTodos(turn.conversationId)
      turn.todosUpdatedAt = Date.now()
    } catch {
      // Todos are a convenience; never let them break the answer.
    }
  }

  async function refreshAdvisories(turn: ChatTurn) {
    try {
      await useAdvisoryStore().fetchAdvisories(turn.conversationId)
      turn.advisoriesUpdatedAt = Date.now()
    } catch {
      // Same as todos: the answer stands on its own without them.
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
      intakeDraft: {},
      intakeDismissed: false,
      choiceQuestions: null,
      error: '',
      sending: true,
      streaming: false,
      todoToolCalled: false,
      webSearch: null,
      notices: [],
      receipts: [],
      letterDraft: null,
      todosUpdatedAt: 0,
      advisoriesUpdatedAt: 0,
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
      // However the turn ended — finished, aborted, or thrown — nothing is
      // being read any more, so the trail must not outlive it.
      live.webSearch = null
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
    turn.webSearch = null
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

  /**
   * Drop the pending decision. Called the moment the user answers it — the
   * answer goes out as an ordinary message, and the options have served their
   * purpose.
   */
  function clearChoices(conversationId: string) {
    const turn = turnFor(conversationId)
    if (!turn) return

    turn.choiceQuestions = null
  }

  function clearIntake(conversationId: string) {
    const turn = turnFor(conversationId)
    if (!turn) return

    turn.intakeFields = null
    turn.intakeDefaults = null
    turn.intakeDraft = {}
    turn.awaitingIntake = false
    turn.intakeDismissed = false
  }

  /**
   * Keep what the user has typed into the intake form.
   *
   * Called as they answer, so closing the form to re-read the thread — or
   * leaving the page entirely — costs them nothing.
   */
  function saveIntakeDraft(conversationId: string, values: Record<string, string>) {
    const turn = turnFor(conversationId)
    if (!turn) return

    turn.intakeDraft = { ...values }
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
    saveIntakeDraft,
    clearChoices,
    clearError,
  }
})
