<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
import { statusTone, statusToneClass, type StatusTone } from '~/lib/status'

const props = withDefaults(defineProps<{
  /** The raw status string (e.g. `in_progress`); mapped to a tone unless `tone` is given. */
  status: string
  /** Override the auto-mapped tone. */
  tone?: StatusTone
  /** Override the displayed text; defaults to the raw status. */
  label?: string
  class?: HTMLAttributes['class']
}>(), {})
</script>

<template>
  <Badge
    variant="outline"
    :class="cn('gap-1.5', statusToneClass(tone ?? statusTone(props.status)), props.class)"
  >
    <span class="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
    <span class="truncate">{{ label ?? props.status }}</span>
    <slot />
  </Badge>
</template>
