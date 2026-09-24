<script setup lang="ts">
import { CheckIcon, XIcon } from '@lucide/vue'
import type { PipelineTemplateStage } from '~/types/pipeline'

defineProps<{ stages: PipelineTemplateStage[] }>()

function isTerminal(stage: PipelineTemplateStage) {
  return stage.outcome_kind === 'won' || stage.outcome_kind === 'not_proceeding'
}

function outcomeLabel(stage: PipelineTemplateStage) {
  if (stage.outcome_kind === 'won') return 'Won'
  if (stage.outcome_kind === 'not_proceeding') return 'Not proceeding'
  return 'Open'
}
</script>
<template>
  <ol class="relative mt-4 grid gap-2.5 text-sm" aria-label="Template stages">
    <div class="absolute top-3 bottom-3 left-[15px] w-px bg-border" aria-hidden="true" />
    <li
      v-for="stage in [...stages].sort((a, b) => a.position - b.position)"
      :key="`${stage.position}-${stage.name}`"
      class="relative flex items-center gap-3 pl-1"
    >
      <span
        class="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium"
        :class="stage.outcome_kind === 'won'
          ? 'border-primary bg-primary text-primary-foreground'
          : isTerminal(stage)
            ? 'border-border bg-muted text-muted-foreground'
            : 'border-border bg-card text-foreground'"
        aria-hidden="true"
      >
        <CheckIcon v-if="stage.outcome_kind === 'won'" class="size-3.5" />
        <XIcon v-else-if="stage.outcome_kind === 'not_proceeding'" class="size-3.5" />
        <template v-else>{{ stage.position + 1 }}</template>
      </span>
      <span class="min-w-0 flex-1 truncate font-normal">{{ stage.name }}</span>
      <Badge variant="outline" class="shrink-0 text-[11px] text-muted-foreground">{{ outcomeLabel(stage) }}</Badge>
    </li>
  </ol>
</template>
