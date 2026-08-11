<script setup lang="ts">
import type { Component, HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  /** Lucide icon component, rendered in a muted circle above the title. */
  icon?: Component
  title: string
  description?: string
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div :class="cn('flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center', props.class)">
    <span
      v-if="icon"
      class="mb-4 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"
    >
      <component :is="icon" class="size-5" />
    </span>

    <p class="text-sm font-medium">{{ title }}</p>
    <p v-if="description" class="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
      {{ description }}
    </p>

    <div v-if="$slots.default" class="mt-5">
      <slot />
    </div>
  </div>
</template>
