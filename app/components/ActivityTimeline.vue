<script setup lang="ts">
import { CheckIcon, Loader2Icon } from '@lucide/vue'

export interface ActivityStep {
  key: string
  label: string
  state: 'done' | 'active' | 'pending'
}

defineProps<{
  steps: ActivityStep[]
}>()
</script>

<template>
  <ol class="space-y-1.5">
    <li v-for="step in steps" :key="step.key" class="flex items-center gap-2 text-xs">
      <span
        class="flex size-4 shrink-0 items-center justify-center"
        :class="step.state === 'active' ? 'text-primary' : 'text-muted-foreground'"
      >
        <CheckIcon v-if="step.state === 'done'" class="size-3.5" />
        <Loader2Icon v-else-if="step.state === 'active'" class="size-3.5 animate-spin" />
        <span v-else class="size-1.5 rounded-full bg-muted-foreground/40" />
      </span>
      <span
        :class="[
          step.state === 'active' ? 'font-medium text-foreground' : 'text-muted-foreground',
        ]"
      >
        {{ step.label }}
      </span>
    </li>
  </ol>
</template>
