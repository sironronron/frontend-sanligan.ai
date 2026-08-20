<script setup lang="ts">
import type { Component, HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{
  title?: string
  description?: string
  icon?: Component
  /** Extra padding for the body (e.g. `p-0` to let a list bleed to the edges). */
  bodyClass?: HTMLAttributes['class']
  class?: HTMLAttributes['class']
}>(), {})
</script>

<template>
  <section :class="cn('surface flex flex-col', props.class)">
    <header
      v-if="title || $slots.actions"
      class="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4"
    >
      <div class="flex min-w-0 items-center gap-2.5">
        <span v-if="icon" class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <component :is="icon" class="size-4" />
        </span>
        <div class="min-w-0">
          <h2 class="text-sm font-semibold tracking-tight">{{ title }}</h2>
          <p v-if="description" class="truncate text-xs text-muted-foreground">{{ description }}</p>
        </div>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
    </header>

    <div :class="cn('flex-1 p-5', bodyClass)">
      <slot />
    </div>
  </section>
</template>
