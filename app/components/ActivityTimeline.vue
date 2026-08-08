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
  <ol class="space-y-2">
    <li
      v-for="(step, index) in steps"
      :key="step.key"
      class="flex items-start gap-2.5 text-xs"
    >
      <span class="flex flex-col items-center">
        <span
          class="flex size-4 shrink-0 items-center justify-center rounded-full"
          :class="step.state === 'active' ? 'bg-primary/15 text-primary' : 'text-muted-foreground'"
        >
          <CheckIcon v-if="step.state === 'done'" class="size-3 text-forest dark:text-peach" />
          <Loader2Icon v-else-if="step.state === 'active'" class="size-3 animate-spin" />
          <span v-else class="size-1.5 rounded-full bg-muted-foreground/40" />
        </span>
        <span
          v-if="index < steps.length - 1"
          class="mt-0.5 w-px flex-1 bg-border"
          :class="step.state === 'done' ? 'bg-primary/40' : ''"
        />
      </span>
      <span
        :class="[
          step.state === 'active' ? 'pt-px font-medium text-foreground' : 'pt-px text-muted-foreground',
        ]"
      >
        {{ step.label }}
      </span>
    </li>
  </ol>
</template>
