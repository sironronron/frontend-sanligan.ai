<script setup lang="ts">
import { Loader2Icon, RotateCcwIcon, TriangleAlertIcon } from '@lucide/vue'
import ChatAvatar from '~/components/chat/ChatAvatar.vue'
import ChatMessage from '~/components/chat/ChatMessage.vue'
import ChatSuggestions from '~/components/chat/ChatSuggestions.vue'
import ChatChoicePrompt, { type ChoiceAnswer, type ChoiceQuestion } from '~/components/chat/ChatChoicePrompt.vue'
import ChatIntakeForm, { type IntakeField } from '~/components/chat/ChatIntakeForm.vue'
import ChatWebSearchTrail from '~/components/chat/ChatWebSearchTrail.vue'
import { useChatSuggestions, type SuggestionContext } from '~/composables/useChatSuggestions'
import type {
  ChatActivityStep,
  ChatMessage as ChatMessageType,
  ChatToolNotice,
  ChatToolReceipt,
  ChatWebSearch,
} from '~/types/chat'
import type { LetterDraftPayload } from '~/types/tiptap'

const props = defineProps<{
  messages: ChatMessageType[]
  streaming: boolean
  statusLabel: string | null
  topic: string | null
  currentStatus: string | null
  activitySteps: ChatActivityStep[]
  awaitingIntake: boolean
  intakeDismissed: boolean
  hasIntakeFields: boolean
  /** The fields the model is waiting on, rendered inline under its reply. */
  intakeFields?: IntakeField[] | null
  intakeDefaults?: Record<string, string> | null
  /** Answers already typed into the form, so closing it costs nothing. */
  intakeDraft?: Record<string, string> | null
  /** The decision the model is waiting on, rendered inline under its reply. */
  choiceQuestions?: ChoiceQuestion[] | null
  lastQuestion: string
  busy: boolean
  streamError: string
  displayContent: (m: ChatMessageType) => string
  searchQuery?: string
  activeSearchId?: string | null
  activeSearchOccurrence?: number
  experienceLevel?: string | null
  suggestionContext?: SuggestionContext
  /** The letter the current turn is still drafting, for a mid-stream reopen. */
  letterDraft?: LetterDraftPayload | null
  /** The web search running right now; cleared the moment it finishes. */
  webSearch?: ChatWebSearch | null
  /** Corrections raised against the turn still streaming. */
  streamNotices?: ChatToolNotice[]
  /** What the current turn wrote — tasks filed, points flagged. */
  receipts?: ChatToolReceipt[]
  /** When the current turn was sent, for the elapsed-time readout. */
  turnStartedAt?: number | null
}>()

const emit = defineEmits<{
  'markdown-click': [event: MouseEvent, message: ChatMessageType]
  rate: [message: ChatMessageType, feedback: 'up' | 'down']
  retry: []
  /** Re-ask the question that produced a given answer. */
  regenerate: [question: string]
  /** Open the panel holding what a tool receipt refers to. */
  'open-panel': [panel: 'tasks' | 'advisories']
  'abandon-intake': []
  'reopen-intake': []
  'submit-intake': [data: Record<string, string>]
  'cancel-intake': []
  'save-intake-draft': [values: Record<string, string>]
  'answer-choice': [answers: ChoiceAnswer[]]
  'select-suggestion': [prompt: string]
}>()

/**
 * The question an answer was given to: the nearest user message above it.
 *
 * Re-asking is driven from the thread rather than from the stream store,
 * because a settled turn has been discarded by then — the store's own `retry`
 * only reaches a turn that is still in flight, which is never true of an
 * answer the reader is looking at and wants re-run.
 */
function questionBehind(index: number): string | null {
  for (let i = index - 1; i >= 0; i--) {
    const message = props.messages[i]
    if (message?.role !== 'user') continue

    // Intake submissions and choice selections are transport, not questions —
    // re-sending one would re-answer a form rather than re-ask anything.
    if (message.content.startsWith('[Intake Form Submission]') || message.content.startsWith('[Choice Selection]')) {
      return null
    }

    return message.content
  }

  return null
}

function regenerate(index: number) {
  const question = questionBehind(index)

  if (question !== null && !props.busy) emit('regenerate', question)
}

const pendingChoice = computed<ChoiceQuestion[] | null>(() =>
  props.choiceQuestions && props.choiceQuestions.length > 0 ? props.choiceQuestions : null,
)

/**
 * Seconds the running turn has taken.
 *
 * Ticked once a second rather than on every frame: the readout is only ever
 * rendered to whole seconds, so anything finer is work nobody can see. The
 * interval only exists while a turn is actually running.
 */
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined

function stopTicker() {
  clearInterval(ticker)
  ticker = undefined
}

watch(
  () => props.streaming,
  (streaming) => {
    stopTicker()

    if (!streaming) return

    now.value = Date.now()
    ticker = setInterval(() => {
      now.value = Date.now()
    }, 1000)
  },
  { immediate: true },
)

onBeforeUnmount(stopTicker)

const elapsedMs = computed(() =>
  props.streaming && props.turnStartedAt ? now.value - props.turnStartedAt : null,
)

const messagesRef = computed(() => props.messages)
const streamingRef = computed(() => props.streaming)
const experienceLevelRef = computed(() => props.experienceLevel ?? null)
const suggestionContextRef = computed<SuggestionContext>(() => props.suggestionContext ?? {})

const { suggestions } = useChatSuggestions(messagesRef, experienceLevelRef, streamingRef, suggestionContextRef)
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-8 px-4 pb-10 pt-6 sm:px-6">
    <ChatMessage
      v-for="(m, index) in messages"
      :id="`msg-${m.id}`"
      :key="m.id"
      :message="m"
      :display-content="displayContent(m)"
      :is-streaming="streaming && index === messages.length - 1"
      :status-label="statusLabel"
      :topic="topic"
      :activity-steps="index === messages.length - 1 ? activitySteps : []"
      :awaiting-intake="awaitingIntake"
      :search-query="searchQuery"
      :active-search-id="activeSearchId"
      :active-search-occurrence="activeSearchOccurrence"
      :letter-draft="letterDraft"
      :web-search="streaming && index === messages.length - 1 ? webSearch : null"
      :stream-notices="index === messages.length - 1 ? streamNotices : undefined"
      :elapsed-ms="index === messages.length - 1 ? elapsedMs : null"
      :can-regenerate="questionBehind(index) !== null"
      :receipts="index === messages.length - 1 ? receipts : undefined"
      @markdown-click="(event, message) => emit('markdown-click', event, message)"
      @rate="(message, feedback) => emit('rate', message, feedback)"
      @regenerate="() => regenerate(index)"
      @open-panel="(panel) => emit('open-panel', panel)"
    />

    <ChatChoicePrompt
      v-if="pendingChoice"
      :questions="pendingChoice"
      :busy="busy"
      @submit="(answers) => emit('answer-choice', answers)"
    />

    <ChatIntakeForm
      v-if="hasIntakeFields && !intakeDismissed"
      :fields="intakeFields ?? []"
      :initial-values="intakeDefaults ?? {}"
      :draft="intakeDraft ?? {}"
      :busy="busy"
      @submit="(data) => emit('submit-intake', data)"
      @cancel="emit('cancel-intake')"
      @update:draft="(vals) => emit('save-intake-draft', vals)"
    />

    <!--
      The turn is collecting facts and has nothing to show yet: no draft, no
      form on screen. Laid out in the assistant's own column so the wait sits
      where the answer will, rather than as a bubble of its own.
    -->
    <div v-if="awaitingIntake && !hasIntakeFields" class="flex gap-3">
      <ChatAvatar working class="mt-0.5" />
      <div class="batayan-sheen min-w-0 flex-1 rounded-xl border border-primary/25 bg-primary/[0.045] px-3.5 py-3">
        <p class="flex items-center gap-2 text-sm">
          <span class="batayan-shimmer-text font-medium">
            {{ currentStatus === 'collecting_facts' ? 'Working out what I need from you' : 'Waiting on a few more details' }}
          </span>
          <span class="flex shrink-0 items-center gap-1 text-primary">
            <span class="batayan-dot" />
            <span class="batayan-dot" style="--dot-delay: 0.15s" />
            <span class="batayan-dot" style="--dot-delay: 0.3s" />
          </span>
        </p>
        <ol v-if="activitySteps.length > 0" class="mt-2.5 space-y-1">
          <li
            v-for="step in activitySteps"
            :key="step.key"
            class="flex items-center gap-2 text-xs"
            :class="step.state === 'active' ? 'font-medium text-foreground' : 'text-muted-foreground/75'"
          >
            <span
              class="size-1.5 shrink-0 rounded-full"
              :class="step.state === 'pending' ? 'bg-border' : 'bg-primary'"
            />
            {{ step.label }}
          </li>
        </ol>
        <ChatWebSearchTrail v-if="webSearch" :search="webSearch" class="mt-2.5" />
      </div>
    </div>

    <!-- Suggested next steps would compete with the decision actually being
         asked for, so they stand down until it is answered. -->
    <ChatSuggestions
      v-if="suggestions.length > 0 && !pendingChoice"
      :suggestions="suggestions"
      @select="(prompt) => emit('select-suggestion', prompt)"
    />

    <div v-if="hasIntakeFields && intakeDismissed" class="flex gap-3">
      <ChatAvatar class="mt-0.5" />
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-3 rounded-xl border bg-card px-3.5 py-3">
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium">Information form closed</p>
          <p class="mt-0.5 text-xs text-muted-foreground">
            Fill in the required details to continue drafting, or cancel this request.
          </p>
        </div>
        <div class="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" class="h-8 text-xs" @click="emit('abandon-intake')">Cancel</Button>
          <Button size="sm" class="h-8 text-xs" @click="emit('reopen-intake')">Fill requirement</Button>
        </div>
      </div>
    </div>

    <div
      v-if="streamError"
      class="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/[0.07] px-3.5 py-3"
    >
      <TriangleAlertIcon class="mt-0.5 size-4 shrink-0 text-destructive" />
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-destructive">That answer could not be completed</p>
        <p class="mt-0.5 text-xs text-muted-foreground">{{ streamError }}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        class="h-8 shrink-0 gap-1.5 text-xs"
        :disabled="!lastQuestion || busy"
        @click="emit('retry')"
      >
        <Loader2Icon v-if="busy" class="size-3.5 animate-spin" />
        <RotateCcwIcon v-else class="size-3.5" />
        Try again
      </Button>
    </div>
  </div>
</template>
