<script setup lang="ts">
import { LayoutGridIcon, ListIcon, TableIcon } from '@lucide/vue'
import type { ViewMode } from '~/composables/useViewMode'

/**
 * Segmented control for how a list is drawn.
 *
 * Icon-only and small: it is chrome sitting beside a heading, not a decision
 * the page wants to draw attention to. The labels live on the tooltip and the
 * accessible name, which is where a screen reader needs them anyway.
 */
const model = defineModel<ViewMode>({ required: true })

const options: Array<{ value: ViewMode, label: string, icon: typeof ListIcon }> = [
  { value: 'list', label: 'List view', icon: ListIcon },
  { value: 'card', label: 'Card view', icon: LayoutGridIcon },
  { value: 'table', label: 'Table view', icon: TableIcon },
]
</script>

<template>
  <div
    class="flex shrink-0 items-center rounded-lg border bg-muted/40 p-0.5"
    role="radiogroup"
    aria-label="Display as"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="model === option.value"
      :aria-label="option.label"
      :title="option.label"
      class="inline-flex size-7 items-center justify-center rounded-md transition-colors"
      :class="model === option.value
        ? 'bg-card text-foreground shadow-sm'
        : 'text-muted-foreground hover:text-foreground'"
      @click="model = option.value"
    >
      <component :is="option.icon" class="size-3.5" />
    </button>
  </div>
</template>
