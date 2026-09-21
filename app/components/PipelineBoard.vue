<script setup lang="ts">
import { AlertCircleIcon, InboxIcon, RefreshCwIcon } from '@lucide/vue'
import type { Pipeline, PipelineItem } from '~/types/pipeline'

const props = defineProps<{
  pipeline: Pipeline
  items: PipelineItem[]
  loading?: boolean
  busy?: boolean
  error?: unknown
  readonly?: boolean
  announcement?: string
}>()

const emit = defineEmits<{
  retry: []
  move: [item: PipelineItem, stageId: string]
  edit: [item: PipelineItem]
  history: [item: PipelineItem]
}>()

const selectedStage = ref(props.pipeline.stages.find(stage => !stage.archived_at)?.id ?? '')
const activeStages = computed(() => props.pipeline.stages.filter(stage => !stage.archived_at).sort((a, b) => a.position - b.position))
const stageOptions = computed(() => activeStages.value.map(stage => ({
  value: stage.id,
  label: `${stage.name} (${cards(stage.id).length})`,
})))

watch(() => [props.pipeline.id, props.pipeline.stages], () => {
  if (!props.pipeline.stages.some(stage => stage.id === selectedStage.value && !stage.archived_at)) {
    selectedStage.value = props.pipeline.stages.find(stage => !stage.archived_at)?.id ?? ''
  }
}, { deep: true })

function cards(stageId: string) {
  return props.items.filter(item => item.stage_id === stageId && !item.archived_at)
}

function status(error: unknown) {
  return (error as { status?: number; statusCode?: number } | undefined)?.status
    ?? (error as { statusCode?: number } | undefined)?.statusCode
}
</script>

<template>
  <section aria-labelledby="board-title" class="mt-5">
    <div class="mb-3 flex items-center gap-2">
      <h2 id="board-title" class="text-lg font-semibold">Intake pipeline</h2>
      <span class="text-sm text-muted-foreground">{{ items.length }} {{ items.length === 1 ? 'item' : 'items' }}</span>
    </div>
    <p class="sr-only" aria-live="polite">{{ announcement }}</p>

    <div v-if="loading" class="grid gap-3 lg:grid-cols-3">
      <Skeleton v-for="i in 3" :key="i" class="h-64 rounded-xl" />
    </div>

    <div v-else-if="error" class="surface-inset py-14 text-center">
      <AlertCircleIcon class="mx-auto size-7 text-destructive" />
      <h2 class="mt-3 text-lg font-semibold">The pipeline could not load</h2>
      <p class="mt-2 text-sm text-muted-foreground">{{ status(error) === 403 ? 'You do not have permission to view this pipeline.' : status(error) === 401 ? 'Your session has ended. Sign in again to continue.' : 'Check your connection and try again.' }}</p>
      <Button v-if="status(error) !== 403 && status(error) !== 401" variant="outline" class="mt-5 min-h-11" @click="emit('retry')">
        <RefreshCwIcon class="mr-1.5 size-4" /> Retry
      </Button>
      <Button v-else-if="status(error) === 401" class="mt-5 min-h-11" @click="navigateTo('/login')">Sign in</Button>
    </div>

    <div v-else-if="!activeStages.length" class="surface-inset py-14 text-center">
      <InboxIcon class="mx-auto size-7 text-muted-foreground" />
      <h2 class="mt-3 text-lg font-semibold">This pipeline has no active stages</h2>
      <p class="mt-2 text-sm text-muted-foreground">Add a stage in Pipeline settings before creating intake items.</p>
    </div>

    <template v-else>
      <div class="mb-4 md:hidden">
        <label for="mobile-stage" class="text-sm font-medium">View pipeline stage</label>
        <SearchableSelect
          id="mobile-stage"
          v-model="selectedStage"
          :options="stageOptions"
          placeholder="Choose a pipeline stage…"
          search-placeholder="Search stages…"
          empty-label="No active stages match your search."
          class="mt-1.5"
        />
      </div>

      <div v-if="!items.some(item => !item.archived_at)" class="surface-inset py-12 text-center">
        <InboxIcon class="mx-auto size-7 text-muted-foreground" />
        <h2 class="mt-3 text-lg font-semibold">No intake items yet</h2>
        <p class="mt-2 text-sm text-muted-foreground">Create an intake item to begin tracking progress through this pipeline.</p>
      </div>

      <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <section
          v-for="stage in activeStages"
          :key="stage.id"
          class="surface-inset min-h-52 p-3"
          :class="stage.id === selectedStage ? 'block' : 'hidden md:block'"
          :aria-labelledby="`stage-${stage.id}`"
        >
          <div class="mb-3 flex items-center justify-between gap-2">
            <div>
              <h3 :id="`stage-${stage.id}`" class="font-semibold">{{ stage.name }}</h3>
              <p class="text-xs text-muted-foreground">{{ stage.outcome_kind === 'open' ? 'Open intake' : stage.outcome_kind === 'won' ? 'Won outcome' : 'Not proceeding' }}</p>
            </div>
            <span class="rounded-full bg-card px-2 py-1 text-xs font-medium">{{ cards(stage.id).length }}</span>
          </div>
          <div v-if="!cards(stage.id).length" class="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No intake items in this stage.</div>
          <div v-else class="grid gap-3">
            <PipelineItemCard
              v-for="item in cards(stage.id)"
              :key="item.id"
              :item="item"
              :stages="activeStages"
              :busy="busy"
              :readonly="readonly"
              @move="emit('move', $event[0], $event[1])"
              @edit="emit('edit', $event)"
              @history="emit('history', $event)"
            />
          </div>
        </section>
      </div>
    </template>
  </section>
</template>
