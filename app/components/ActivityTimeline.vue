<script setup lang="ts">
import { CheckIcon, Loader2Icon, CircleIcon } from '@lucide/vue'

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
  <ol>
    <li
      v-for="(step, index) in steps"
      :key="step.key"
      class="relative flex gap-2 text-xs"
      :class="index < steps.length - 1 ? 'pb-2' : ''"
    >
      <!--
        Connector runs from the bottom of this bullet to the top of the next one,
        so it stays unbroken however tall the rows are.
      -->
      <span
        v-if="index < steps.length - 1"
        class="absolute bottom-0 left-2.5 top-5 w-px -translate-x-1/2 transition-colors duration-300"
        :class="step.state === 'done' ? 'bg-forest/30 dark:bg-peach/30' : 'bg-border'"
      />
      <span
        class="relative flex size-5 shrink-0 items-center justify-center rounded-full transition-colors duration-300"
        :class="[
          step.state === 'done'
            ? 'bg-forest/15 text-forest dark:bg-peach/15 dark:text-peach'
            : step.state === 'active'
              ? 'bg-primary/15 text-primary'
              : 'bg-muted text-muted-foreground/50',
        ]"
      >
        <CheckIcon v-if="step.state === 'done'" class="size-3" />
        <Loader2Icon v-else-if="step.state === 'active'" class="size-3 animate-spin" />
        <CircleIcon v-else class="size-2" />
      </span>
      <!-- leading-5 matches the bullet height, so the first line centres on it. -->
      <span
        class="min-w-0 flex-1 break-words leading-5 transition-colors duration-300"
        :class="[
          step.state === 'active'
            ? 'font-medium text-foreground'
            : step.state === 'done'
              ? 'text-muted-foreground/70'
              : 'text-muted-foreground/50',
        ]"
      >
        {{ step.label }}
      </span>
    </li>
  </ol>
</template>
