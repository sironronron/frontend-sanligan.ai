<script setup lang="ts">
import type { Component, HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const props = withDefaults(defineProps<{
  icon?: Component
  title: string
  description?: string
  /** Render a primary action button with this label. */
  actionLabel?: string
  actionIcon?: Component
  /** Deep-link the action to this route. */
  to?: string
  class?: HTMLAttributes['class']
}>(), {})

const emit = defineEmits<{ action: [] }>()
</script>

<template>
  <div
    :class="cn(
      'relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed bg-muted/45 px-6 py-14 text-center',
      props.class,
    )"
  >
    <div class="gradient-blob -right-10 -top-10 size-44 bg-primary/10" aria-hidden="true" />

    <div class="relative flex flex-col items-center">
      <span
        v-if="icon"
        class="mb-4 flex size-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-raised"
      >
        <component :is="icon" class="size-5" />
      </span>

      <p class="text-sm font-medium">{{ title }}</p>
      <p v-if="description" class="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {{ description }}
      </p>

      <Button
        v-if="actionLabel"
        class="mt-5 gap-2"
        @click="to ? navigateTo(to) : emit('action')"
      >
        <component :is="actionIcon" v-if="actionIcon" class="size-4" />
        {{ actionLabel }}
      </Button>

      <div v-if="$slots.default" class="mt-5">
        <slot />
      </div>
    </div>
  </div>
</template>
