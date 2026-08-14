<script setup lang="ts">
import { ChevronRightIcon } from '@lucide/vue'

/**
 * The accordion bar over one tag's worth of threads or files.
 *
 * Both trees in the case rail group by tag and both had drawn their own copy of
 * this row; one of them had already started drifting. It reads as a level below
 * CaseSidebarSection — indented, sentence case, lighter — and sticks just under
 * the section header rather than at the top of the scroller, so a long group
 * keeps both its own name and its section's on screen.
 *
 * The negative inline margin cancels the band's gutter so the bar is opaque
 * edge to edge; without it, rows passing beneath show through either side of it.
 * `top-10` is CaseSidebarSection's fixed height — the two are a pair.
 */
defineProps<{
  name: string
  count: number
  collapsed: boolean
}>()
</script>

<template>
  <button
    type="button"
    :aria-expanded="!collapsed"
    class="sticky top-10 z-10 -mx-2 flex h-8 items-center gap-1.5 bg-sidebar/95 pl-4 pr-3.5 text-xs font-medium text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
  >
    <ChevronRightIcon
      class="size-3.5 shrink-0 transition-transform"
      :class="collapsed ? '' : 'rotate-90'"
    />
    <span class="min-w-0 flex-1 truncate text-left">{{ name }}</span>
    <span class="shrink-0 tabular-nums opacity-60">{{ count }}</span>
  </button>
</template>
