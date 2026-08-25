<script setup lang="ts">
import type { Component, HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  title: string
  description?: string
  /** Small uppercase eyebrow above the title. */
  eyebrow?: string
  /** Optional leading icon, rendered in a gradient chip. */
  icon?: Component
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <header :class="cn('mb-6', props.class)">
    <div v-if="$slots.breadcrumb" class="mb-2 text-sm text-muted-foreground">
      <slot name="breadcrumb" />
    </div>

    <div class="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div class="flex min-w-0 items-start gap-3.5">
        <span
          v-if="icon"
          class="bg-brand-gradient flex size-11 shrink-0 items-center justify-center rounded-xl text-primary-foreground shadow-sm"
        >
          <component :is="icon" class="size-5" />
        </span>
        <div class="min-w-0">
          <p v-if="eyebrow" class="text-label mb-1">{{ eyebrow }}</p>
          <h1 class="text-h1 font-semibold tracking-tight">{{ title }}</h1>
          <p v-if="description" class="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {{ description }}
          </p>
          <slot />
        </div>
      </div>

      <div v-if="$slots.actions" class="flex shrink-0 flex-wrap items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>
