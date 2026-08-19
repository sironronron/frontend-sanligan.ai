<script setup lang="ts">
import ChatAssistantMessage from '~/components/chat/ChatAssistantMessage.vue'
import ChatUserMessage from '~/components/chat/ChatUserMessage.vue'
import type {
  ChatActivityStep,
  ChatMessage,
  ChatToolNotice,
  ChatToolReceipt,
  ChatWebSearch,
} from '~/types/chat'
import type { LetterDraftPayload } from '~/types/tiptap'

/**
 * One turn in the thread.
 *
 * The two roles are laid out on entirely different principles — a contained
 * question against an uncontained answer — so each owns its own component and
 * this one only routes between them and carries the thread-level concerns
 * (in-thread search highlighting) that apply to both.
 */
const props = defineProps<{
  message: ChatMessage
  displayContent: string
  isStreaming: boolean
  statusLabel: string | null
  topic: string | null
  activitySteps: ChatActivityStep[]
  awaitingIntake: boolean
  searchQuery?: string
  activeSearchId?: string | null
  activeSearchOccurrence?: number
  /** The letter this turn is still drafting; offers the editor back mid-stream. */
  letterDraft?: LetterDraftPayload | null
  /** The web search running right now, shown as a live trail of sites read. */
  webSearch?: ChatWebSearch | null
  /** Corrections raised against this turn while it is still streaming. */
  streamNotices?: ChatToolNotice[]
  /** Wall-clock time the live turn has taken, for the folded work summary. */
  elapsedMs?: number | null
  /** A question behind this answer can be re-asked. */
  canRegenerate?: boolean
  /** What this turn actually wrote — tasks filed, points flagged. */
  receipts?: ChatToolReceipt[]
}>()

const emit = defineEmits<{
  'markdown-click': [event: MouseEvent, message: ChatMessage]
  rate: [message: ChatMessage, feedback: 'up' | 'down']
  regenerate: [message: ChatMessage]
  'open-panel': [panel: 'tasks' | 'advisories']
}>()

const query = computed(() => props.searchQuery?.trim().toLowerCase() ?? '')

const matchesSearch = computed(
  () => query.value !== '' && props.message.content.toLowerCase().includes(query.value),
)

const isActiveSearch = computed(
  () => matchesSearch.value && props.activeSearchId === props.message.id,
)

const highlight = computed(() => ({
  query: props.searchQuery ?? '',
  active: isActiveSearch.value ? props.activeSearchOccurrence ?? 0 : null,
}))
</script>

<template>
  <div
    class="rounded-2xl transition-[background-color,box-shadow] duration-300"
    :class="[
      isActiveSearch ? 'bg-primary/[0.07] shadow-[0_0_0_2px_var(--primary)]' : '',
      matchesSearch && !isActiveSearch ? 'shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_35%,transparent)]' : '',
      query !== '' && !matchesSearch ? 'opacity-40' : '',
      matchesSearch ? 'px-2 py-1.5' : '',
    ]"
  >
    <ChatUserMessage
      v-if="message.role === 'user'"
      :message="message"
      :highlight="highlight"
    />

    <ChatAssistantMessage
      v-else
      :message="message"
      :display-content="displayContent"
      :is-streaming="isStreaming"
      :status-label="statusLabel"
      :topic="topic"
      :activity-steps="activitySteps"
      :awaiting-intake="awaitingIntake"
      :highlight="highlight"
      :letter-draft="letterDraft"
      :web-search="webSearch"
      :stream-notices="streamNotices"
      :elapsed-ms="elapsedMs"
      :can-regenerate="canRegenerate"
      :receipts="receipts"
      @markdown-click="(event, m) => emit('markdown-click', event, m)"
      @rate="(m, feedback) => emit('rate', m, feedback)"
      @regenerate="(m) => emit('regenerate', m)"
      @open-panel="(panel) => emit('open-panel', panel)"
    />
  </div>
</template>
