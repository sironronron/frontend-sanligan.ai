<script setup lang="ts">
import type { Component, HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
import { isAtLimit, limitPct } from '~/stores/billing'

const props = withDefaults(defineProps<{
  label: string
  /** Big number/value shown on the tile. */
  value?: string | number | null
  /** Small context line (e.g. "3 of 5 seats"). */
  hint?: string
  icon?: Component
  /** Deep-link the whole tile when set. */
  to?: string
  /** Usage meter: draws a progress bar and colors it near/at limit. */
  used?: number | null
  limit?: number | null
  class?: HTMLAttributes['class']
}>(), {
  value: null,
  used: null,
  limit: null,
})

const isLink = computed(() => !!props.to)
const meterPct = computed(() =>
  props.limit != null && props.used != null ? limitPct(props.used, props.limit) : null,
)
const meterAtLimit = computed(() =>
  props.limit != null && props.used != null ? isAtLimit(props.used, props.limit) : false,
)
</script>

<template>
  <component
    :is="isLink ? 'NuxtLink' : 'div'"
    :to="isLink ? to : undefined"
    :class="cn(
      'surface tile-interactive relative flex flex-col gap-3 p-5',
      isLink && 'cursor-pointer focus-visible:ring-2 focus-visible:ring-ring/50',
      props.class,
    )"
  >
    <div class="flex items-center justify-between gap-3">
      <span class="text-label">{{ label }}</span>
      <span v-if="icon" class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <component :is="icon" class="size-4" />
      </span>
    </div>

    <div class="flex items-baseline gap-2">
      <span class="text-h2 font-semibold tabular-nums">{{ value ?? '—' }}</span>
    </div>

    <p v-if="hint" class="text-caption text-muted-foreground">{{ hint }}</p>

    <div v-if="meterPct !== null" class="mt-1">
      <div class="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          class="h-full rounded-full transition-all"
          :class="meterAtLimit ? 'bg-destructive' : meterPct > 80 ? 'bg-espresso dark:bg-peach' : 'bg-primary'"
          :style="{ width: `${meterPct}%` }"
        />
      </div>
    </div>

    <slot />
  </component>
</template>
