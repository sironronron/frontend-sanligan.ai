<script setup lang="ts">
import {
  CheckIcon,
  RotateCcwIcon,
  SparklesIcon,
  XIcon,
} from '@lucide/vue'

/**
 * What the assistant is doing to the selected text, anchored beside it.
 *
 * Two states, and the second one is the point: the rewrite is *proposed*, not
 * applied. The previous behaviour dropped the model's output straight into the
 * document, which on a legal letter means a clause silently changes wording
 * with no way back except undo — and no way to compare it against what was
 * there. Here the original stays on screen, highlighted, while the suggestion
 * sits beside it waiting to be accepted.
 */
defineProps<{
  /** Viewport coordinates of the range being worked on. */
  top: number
  left: number
  /** Human name of the action, e.g. "Make formal". */
  action: string
  /** The proposed replacement, once it has arrived. */
  suggestion: string | null
  error: string
}>()

const emit = defineEmits<{
  accept: []
  discard: []
  retry: []
}>()
</script>

<template>
  <Teleport to="body">
    <!--
      `pointer-events-auto` and `data-dismissable-layer` are both load-bearing.
      This is teleported to <body>, but the letter lives in a modal Sheet:
      while that is open the dialog primitive sets `pointer-events: none` on
      the body and re-enables it only inside its own content. Without the
      first attribute every button here is inert — the panel renders perfectly
      and ignores the mouse. Without the second, a click that does land is read
      as an outside interaction and dismisses the Sheet underneath it.
      (The floating toolbar carries both for the same reason.)
    -->
    <div
      data-dismissable-layer
      class="pointer-events-auto fixed z-[120] w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-popover shadow-xl"
      :style="{ top: `${top}px`, left: `${left}px` }"
      role="dialog"
      :aria-label="`${action} — assistant suggestion`"
      @pointerdown.stop
    >
      <header class="flex items-center gap-2 border-b px-3 py-2">
        <span class="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary">
          <SparklesIcon class="size-3" />
        </span>
        <span class="min-w-0 flex-1 truncate text-xs font-medium">{{ action }}</span>
        <button
          type="button"
          class="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Dismiss"
          @click="emit('discard')"
        >
          <XIcon class="size-3" />
        </button>
      </header>

      <!-- Working: the shimmer here and the shimmer on the highlighted text in
           the document are the same beat, so the two read as one thing. -->
      <div v-if="!suggestion && !error" class="space-y-1.5 px-3 py-3" aria-live="polite">
        <span class="batayan-sheen block h-2.5 w-[85%] rounded-full bg-muted" />
        <span class="batayan-sheen block h-2.5 w-full rounded-full bg-muted" />
        <span class="batayan-sheen block h-2.5 w-[60%] rounded-full bg-muted" />
        <p class="pt-1 text-[11px] text-muted-foreground">Reading the highlighted text…</p>
      </div>

      <div v-else-if="error" class="px-3 py-3">
        <p class="text-xs text-destructive">{{ error }}</p>
        <div class="mt-2.5 flex justify-end gap-1.5">
          <Button variant="ghost" size="sm" class="h-7 px-2.5 text-xs" @click="emit('discard')">Close</Button>
          <Button variant="outline" size="sm" class="h-7 gap-1.5 px-2.5 text-xs" @click="emit('retry')">
            <RotateCcwIcon class="size-3" />
            Try again
          </Button>
        </div>
      </div>

      <div v-else>
        <!-- Selectable on purpose: a reader who wants only half the suggestion
             should be able to copy it rather than take all of it or none. -->
        <p class="max-h-56 select-text overflow-y-auto whitespace-pre-wrap px-3 py-2.5 text-[13px] leading-relaxed">
          {{ suggestion }}
        </p>
        <footer class="flex items-center gap-1.5 border-t bg-muted/30 px-3 py-2">
          <p class="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
            Replaces the highlighted text
          </p>
          <Button
            variant="ghost"
            size="sm"
            class="h-7 px-2.5 text-xs text-muted-foreground"
            @click="emit('discard')"
          >
            Discard
          </Button>
          <Button variant="outline" size="sm" class="h-7 gap-1.5 px-2.5 text-xs" @click="emit('retry')">
            <RotateCcwIcon class="size-3" />
          </Button>
          <Button size="sm" class="h-7 gap-1.5 px-3 text-xs" @click="emit('accept')">
            <CheckIcon class="size-3" />
            Replace
          </Button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
