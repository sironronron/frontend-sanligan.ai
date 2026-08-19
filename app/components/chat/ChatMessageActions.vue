<script setup lang="ts">
import { CheckIcon, CopyIcon, RotateCcwIcon, ThumbsDownIcon, ThumbsUpIcon } from '@lucide/vue'

/**
 * The actions on a finished answer.
 *
 * Held at low contrast and revealed on hover on pointer devices, always
 * visible on touch — a row of icons competing with the text is the most
 * common way an otherwise clean answer surface ends up feeling busy. They sit
 * in the answer's own column rather than floating, so they scroll with the
 * message they belong to.
 */
const props = defineProps<{
  content: string
  feedback?: string | null
  /** Offer a re-run of the question that produced this answer. */
  canRetry?: boolean
}>()

const emit = defineEmits<{
  rate: [feedback: 'up' | 'down']
  retry: []
}>()

const copied = ref(false)
let resetTimer: ReturnType<typeof setTimeout> | undefined

async function copy() {
  try {
    await navigator.clipboard.writeText(props.content)
  } catch {
    // Clipboard permissions vary; the textarea route works everywhere the
    // async API is refused, and copying must not be the thing that fails.
    const textarea = document.createElement('textarea')
    textarea.value = props.content
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  }

  copied.value = true
  clearTimeout(resetTimer)
  resetTimer = setTimeout(() => {
    copied.value = false
  }, 1600)
}

onBeforeUnmount(() => clearTimeout(resetTimer))
</script>

<template>
  <div
    class="-ml-1.5 flex items-center gap-0.5 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover/turn:opacity-100 max-lg:opacity-100"
  >
    <button
      type="button"
      class="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      :title="copied ? 'Copied' : 'Copy answer'"
      @click="copy"
    >
      <CheckIcon v-if="copied" class="size-3.5 text-primary" />
      <CopyIcon v-else class="size-3.5" />
      <span>{{ copied ? 'Copied' : 'Copy' }}</span>
    </button>

    <button
      v-if="canRetry"
      type="button"
      class="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title="Ask again"
      aria-label="Ask again"
      @click="emit('retry')"
    >
      <RotateCcwIcon class="size-3.5" />
    </button>

    <span class="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />

    <button
      type="button"
      class="inline-flex size-7 items-center justify-center rounded-lg transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      :class="feedback === 'up' ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:text-foreground'"
      :title="feedback === 'up' ? 'Remove rating' : 'Helpful'"
      :aria-pressed="feedback === 'up'"
      aria-label="Helpful"
      @click="emit('rate', 'up')"
    >
      <ThumbsUpIcon class="size-3.5" />
    </button>

    <button
      type="button"
      class="inline-flex size-7 items-center justify-center rounded-lg transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      :class="feedback === 'down' ? 'bg-destructive/12 text-destructive' : 'text-muted-foreground hover:text-foreground'"
      :title="feedback === 'down' ? 'Remove rating' : 'Not helpful'"
      :aria-pressed="feedback === 'down'"
      aria-label="Not helpful"
      @click="emit('rate', 'down')"
    >
      <ThumbsDownIcon class="size-3.5" />
    </button>
  </div>
</template>
