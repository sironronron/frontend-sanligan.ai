<script setup lang="ts">
import { PenLineIcon, TriangleAlertIcon } from '@lucide/vue'
import { renderMarkdown } from '~/utils/markdown'
import { citationMarkFrom } from '~/utils/citations'
import { vHighlight } from '~/directives/highlight'
import { useCitationFocus } from '~/composables/useCitationFocus'
import ChatAvatar from '~/components/chat/ChatAvatar.vue'
import ChatMessageActions from '~/components/chat/ChatMessageActions.vue'
import ChatReasoningPanel from '~/components/chat/ChatReasoningPanel.vue'
import ChatToolReceipts from '~/components/chat/ChatToolReceipts.vue'
import { useLetterDraftPanel } from '~/composables/useLetterDraftPanel'
import type {
  ChatActivityStep,
  ChatMessage,
  ChatToolNotice,
  ChatToolReceipt,
  ChatWebSearch,
} from '~/types/chat'
import type { LetterDraftPayload } from '~/types/tiptap'

/**
 * The assistant's turn: the product's main reading surface.
 *
 * Laid out as a mark in the gutter and one column of content beside it, in
 * this order — how the answer was worked out, the answer, anything that
 * qualifies it, then the actions on it. Nothing wraps the answer: no bubble,
 * no card, no border. A container caps how long a reply can be before it looks
 * wrong, and these replies are long.
 *
 * The wait is never a bare spinner. Before a single token exists the reasoning
 * panel is the whole turn, open and naming the step in progress; the moment
 * text starts arriving it folds into one line and the answer takes the space.
 */
const props = defineProps<{
  message: ChatMessage
  displayContent: string
  isStreaming: boolean
  statusLabel: string | null
  topic: string | null
  activitySteps: ChatActivityStep[]
  awaitingIntake: boolean
  highlight: { query: string, active: number | null }
  /** The letter this turn is still drafting; offers the editor back mid-stream. */
  letterDraft?: LetterDraftPayload | null
  /** The web search running right now, shown as a live trail of sites read. */
  webSearch?: ChatWebSearch | null
  /** Corrections raised against this turn while it is still streaming. */
  streamNotices?: ChatToolNotice[]
  /** What this turn actually wrote — tasks filed, points flagged. */
  receipts?: ChatToolReceipt[]
  /** Wall-clock time the live turn has taken, for the folded summary. */
  elapsedMs?: number | null
  /**
   * There is a question behind this answer that can be re-asked. False on a
   * turn whose question cannot be recovered, so the action is never offered
   * as a button that does nothing.
   */
  canRegenerate?: boolean
}>()

const emit = defineEmits<{
  'markdown-click': [event: MouseEvent, message: ChatMessage]
  rate: [message: ChatMessage, feedback: 'up' | 'down']
  /** Re-ask the question that produced this answer. */
  regenerate: [message: ChatMessage]
  /** Open the panel holding what a tool receipt refers to. */
  'open-panel': [panel: 'tasks' | 'advisories']
}>()

/** A local id means the server has not saved this turn yet. */
const persisted = computed(() => !props.message.id.startsWith('local-'))

const writing = computed(() => props.displayContent !== '')

/** The turn is producing something — text, or the work that precedes it. */
const working = computed(() => props.isStreaming && !props.awaitingIntake)

/**
 * Steps for the panel: the live ones while the turn runs, the persisted ones
 * afterwards. A finished answer's steps are all `done` — the panel is a record
 * at that point, not a progress indicator.
 */
const steps = computed<ChatActivityStep[]>(() => {
  if (props.isStreaming || props.activitySteps.length > 0) return props.activitySteps

  return (props.message.activity?.steps ?? []).map((step) => ({
    key: step.key,
    label: step.label,
    state: 'done' as const,
  }))
})

const durationMs = computed(() => props.message.activity?.duration_ms ?? props.elapsedMs ?? null)

const webSources = computed(
  () => props.message.activity?.web_sources
    ?? props.message.sources.filter((source) => source.type === 'web').length,
)

const showReasoning = computed(() => steps.value.length > 0 && !props.awaitingIntake)

/**
 * Claims the reply made about actions the turn never took.
 *
 * Live ones come from the store; once the thread is re-fetched they arrive on
 * the message itself. Both render the same way, so the caveat does not blink
 * out and back as the optimistic copy is swapped for the saved one.
 */
const notices = computed<ChatToolNotice[]>(() => {
  const saved = props.message.tool_notices ?? []

  return saved.length > 0 ? saved : (props.streamNotices ?? [])
})

const letter = computed(() => props.message.letter_draft ?? (props.isStreaming ? props.letterDraft : null) ?? null)

/**
 * The turn has nothing of its own to show yet.
 *
 * While the model is working out what it needs, the wait is rendered by the
 * thread as its own block — this turn is a placeholder holding an empty
 * message. Without this it would still draw its avatar in the gutter, leaving
 * a stray mark above the real one with no content beside it.
 */
const empty = computed(() =>
  !writing.value
  && !working.value
  && !showReasoning.value
  && !letter.value
  && (props.receipts?.length ?? 0) === 0
  && notices.value.length === 0,
)

function openLetter() {
  const draft = props.message.letter_draft

  if (draft) {
    useLetterDraftPanel().openLetterDraft({ ...draft, messageId: props.message.id })

    return
  }

  // The turn is still drafting: reopen the panel on whatever it holds so far,
  // or in its drafting state when the document has not landed yet.
  const streaming = props.letterDraft
  if (!streaming) return

  if (streaming.content) useLetterDraftPanel().openLetterDraft(streaming)
  else useLetterDraftPanel().beginLetterDraft()
}

/**
 * Hovering or keyboard-focusing a citation mark lights the matching card on
 * the right and the passage in the reader, so the three surfaces read as one
 * citation. Leaving the mark clears it.
 */
const { focusMark, clearFocus } = useCitationFocus()

function onCitePointer(event: MouseEvent | FocusEvent) {
  const mark = citationMarkFrom(event.target)
  if (mark) focusMark(mark)
  else clearFocus()
}
</script>

<template>
  <div v-if="!empty" class="group/turn batayan-turn-in flex gap-3">
    <ChatAvatar :working="working" class="mt-0.5" />

    <div class="flex min-w-0 flex-1 flex-col gap-3">
      <ChatReasoningPanel
        v-if="showReasoning"
        :steps="steps"
        :live="working"
        :writing="writing"
        :duration-ms="durationMs"
        :web-sources="webSources"
        :web-search="webSearch"
      />

      <!--
        Nothing has arrived yet and there are no steps to show — the very first
        moment of a turn. Three lines of shimmer rather than a spinner: it
        occupies the space the answer is about to fill, so the layout does not
        jump when the first token lands.
      -->
      <div v-else-if="working && !writing" class="batayan-sheen w-full space-y-2 rounded-lg py-1" aria-hidden="true">
        <span class="block h-3 w-[42%] rounded-full bg-muted" />
        <span class="block h-3 w-[88%] rounded-full bg-muted" />
        <span class="block h-3 w-[64%] rounded-full bg-muted" />
        <span class="sr-only">{{ statusLabel ?? 'Working on your answer' }}</span>
      </div>

      <div
        v-if="writing"
        v-highlight="highlight"
        class="batayan-prose"
        :data-writing="working ? 'true' : 'false'"
        v-html="renderMarkdown(displayContent, { bare: true })"
        @click="emit('markdown-click', $event, message)"
        @mouseover="onCitePointer"
        @mouseleave="clearFocus()"
        @focusin="onCitePointer"
        @focusout="clearFocus()"
      />

      <!-- The turn produced a letter: the editor is where it is read and
           signed, so the answer offers the way back into it. -->
      <div v-if="letter">
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.06] px-3 py-2 text-left text-xs transition-colors hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          @click="openLetter"
        >
          <span class="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <PenLineIcon class="size-3.5" />
          </span>
          <span class="min-w-0">
            <span class="block truncate font-medium text-foreground">
              {{ letter.title ?? 'Your letter' }}
            </span>
            <span class="block text-[11px] text-muted-foreground">
              {{ letter.drafting && !letter.content ? 'Drafting…' : 'Open in the editor' }}
            </span>
          </span>
        </button>
      </div>

      <ChatToolReceipts
        v-if="receipts && receipts.length > 0"
        :receipts="receipts"
        @open="(panel) => emit('open-panel', panel)"
      />

      <!--
        The turn claimed to do something it did not do. Shown with the answer
        rather than in place of it: the legal content is usually still worth
        reading, and the reader needs to know which part of it was never
        actually checked.
      -->
      <ul v-if="notices.length > 0" class="space-y-1.5">
        <li
          v-for="notice in notices"
          :key="notice.kind"
          class="flex items-start gap-2 rounded-xl border border-warning/35 bg-warning/[0.09] px-3 py-2 text-xs leading-relaxed"
        >
          <TriangleAlertIcon class="mt-0.5 size-3.5 shrink-0 text-warning" />
          <span class="text-foreground/85">{{ notice.message }}</span>
        </li>
      </ul>

      <ChatMessageActions
        v-if="persisted && writing && !working"
        :content="message.content"
        :feedback="message.feedback"
        :can-retry="canRegenerate"
        @rate="(feedback) => emit('rate', message, feedback)"
        @retry="emit('regenerate', message)"
      />
    </div>
  </div>
</template>
