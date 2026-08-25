<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { SearchIcon } from '@lucide/vue'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import ViewModeToggle from '~/components/ViewModeToggle.vue'
import type { ViewMode } from '~/composables/useViewMode'

const search = defineModel<string>('search', { default: '' })
const view = defineModel<ViewMode>('view')

const props = withDefaults(defineProps<{
  placeholder?: string
  class?: HTMLAttributes['class']
  /** Hide the view toggle even when `view` is bound. */
  hideView?: boolean
}>(), {
  placeholder: 'Search…',
})
</script>

<template>
  <div :class="cn('flex flex-wrap items-center gap-2', props.class)">
    <div class="relative min-w-[12rem] flex-1">
      <SearchIcon class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input v-model="search" :placeholder="placeholder" class="pl-9" />
    </div>

    <div v-if="$slots.filters" class="flex flex-wrap items-center gap-2">
      <slot name="filters" />
    </div>

    <ViewModeToggle
      v-if="view !== undefined && !hideView"
      v-model="view"
    />
  </div>
</template>
