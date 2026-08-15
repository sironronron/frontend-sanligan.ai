<script setup lang="ts">
import { ChevronRightIcon, Loader2Icon } from '@lucide/vue'

/**
 * One band of the case rail: details, threads, files, drafts.
 *
 * The header sticks to the top of the rail's single scroller, so scrolling
 * down through a long thread list swaps "Threads" for "Files" in place and the
 * rail always says what you are reading. The section's own primary action —
 * new thread, upload — rides in the header rather than sitting below it as a
 * full-width button, which is what used to cost every list several rows of
 * chrome before its first item.
 */
defineProps<{
  label: string
  count?: number
  open: boolean
  /** Reads out as the count's unit for screen readers, e.g. "3 threads". */
  countLabel?: string
  /** Items still being processed; renders a pulsing badge on the title. */
  pendingCount?: number
}>()

defineEmits<{ toggle: [] }>()
</script>

<template>
  <!--
    A fixed height rather than padding: CaseSidebarGroupHeader sticks directly
    beneath this one, and it can only know where "beneath" is if this bar's
    height does not drift with its contents.
  -->
  <div class="sticky top-0 z-20 flex h-10 items-center gap-0.5 border-b bg-sidebar/95 pr-1.5 backdrop-blur-sm">
    <button
      type="button"
      :aria-expanded="open"
      class="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md pl-2 pr-1 text-left text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      @click="$emit('toggle')"
    >
      <ChevronRightIcon
        class="size-3.5 shrink-0 transition-transform"
        :class="open ? 'rotate-90' : ''"
      />
      <span class="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wider">
        {{ label }}
      </span>
      <span v-if="count" class="shrink-0 text-xs tabular-nums">
        {{ count }}
        <span class="sr-only">{{ countLabel }}</span>
      </span>
      <span
        v-if="pendingCount"
        class="flex shrink-0 items-center gap-1 rounded-full bg-espresso/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-espresso dark:bg-peach/10 dark:text-peach"
        :title="`${pendingCount} file${pendingCount === 1 ? '' : 's'} in queue or processing`"
      >
        <Loader2Icon class="size-2.5 animate-spin" />
        {{ pendingCount }}
        <span class="sr-only">
          {{ pendingCount }} file{{ pendingCount === 1 ? '' : 's' }} in queue or processing
        </span>
      </span>
    </button>

    <slot name="action" />
  </div>
</template>
