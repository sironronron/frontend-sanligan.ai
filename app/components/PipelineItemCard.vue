<script setup lang="ts">
import { ArrowRightIcon, CalendarClockIcon, MoreHorizontalIcon } from '@lucide/vue'
import type { PipelineItem, PipelineStage } from '~/types/pipeline'

const props = defineProps<{
  item: PipelineItem
  stages: PipelineStage[]
  busy?: boolean
  readonly?: boolean
}>()

const emit = defineEmits<{
  move: [item: PipelineItem, stageId: string]
  edit: [item: PipelineItem]
  history: [item: PipelineItem]
}>()

const open = ref(false)
const destination = ref('')
const moveTrigger = ref<{ $el: HTMLElement } | null>(null)
const currentStage = computed(() => props.stages.find(stage => stage.id === props.item.stage_id) ?? props.item.stage)
const terminal = computed(() => currentStage.value?.outcome_kind === 'won' || currentStage.value?.outcome_kind === 'not_proceeding')
const available = computed(() => terminal.value ? [] : props.stages.filter(stage => stage.id !== props.item.stage_id && !stage.archived_at))
const stageOptions = computed(() => available.value.map(stage => ({ value: stage.id, label: stage.name })))

function restoreMoveFocus() {
  nextTick(() => moveTrigger.value?.$el.focus())
}

function move() {
  if (destination.value) {
    emit('move', props.item, destination.value)
    open.value = false
    destination.value = ''
    restoreMoveFocus()
  }
}
</script>

<template>
  <article class="surface flex flex-col gap-3 p-4 shadow-sm transition-shadow hover:shadow-raised" :aria-label="`${item.title} for ${item.client?.display_name ?? 'client'}`">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold">{{ item.client?.display_name ?? 'Client unavailable' }}</p>
        <p class="mt-1 break-words text-sm text-foreground/80">{{ item.title }}</p>
      </div>
      <Button variant="ghost" size="icon" class="size-10 shrink-0" :aria-label="`Actions for ${item.title}`" @click="open = !open">
        <MoreHorizontalIcon class="size-4" />
      </Button>
    </div>
    <div class="flex flex-wrap gap-2 text-xs text-muted-foreground">
      <span class="rounded-full bg-muted px-2 py-1">{{ item.client?.client_type === 'organization' ? 'Organization' : 'Person' }}</span>
      <span v-if="item.source" class="rounded-full border px-2 py-1">{{ item.source }}</span>
    </div>
    <p v-if="item.next_action_at" class="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarClockIcon class="size-3.5" /> Next action {{ new Date(item.next_action_at).toLocaleDateString() }}</p>

    <div v-if="open" class="border-t pt-3">
      <p class="mb-2 text-xs text-muted-foreground">Current stage: <span class="font-medium text-foreground">{{ currentStage?.name ?? 'Unavailable' }}</span></p>
      <label class="sr-only" :for="`move-${item.id}`">Move {{ item.title }} to stage</label>
      <SearchableSelect
        :id="`move-${item.id}`"
        v-model="destination"
        :options="stageOptions"
        placeholder="Choose a destination stage…"
        search-placeholder="Search destination stages…"
        empty-label="No active destination stages match your search."
        :disabled="terminal || busy || readonly"
        class="mt-1.5"
      />
      <div class="mt-2 grid grid-cols-2 gap-2">
        <Button variant="outline" class="min-h-10" :disabled="readonly || busy || terminal || !destination" @click="move">{{ busy ? 'Moving…' : 'Move' }}</Button>
        <Button variant="ghost" class="min-h-10" :disabled="busy" @click="emit('history', item)">History</Button>
      </div>
      <p v-if="terminal" class="mt-2 text-xs text-muted-foreground">Terminal intake items cannot be moved.</p>
      <p v-else-if="!available.length" class="mt-2 text-xs text-muted-foreground">No active destination stages are available.</p>
    </div>

    <div v-else class="flex items-center justify-between gap-2 border-t pt-3">
      <Button ref="moveTrigger" variant="ghost" size="sm" class="min-h-10 px-0 text-xs" :disabled="readonly || busy || terminal" :title="terminal ? 'Terminal intake items cannot be moved.' : undefined" @click="open = true">
        <ArrowRightIcon class="mr-1 size-3.5" /> Move to…
      </Button>
      <Button variant="ghost" size="sm" class="min-h-10 text-xs" :disabled="busy" @click="emit('edit', item)">Edit</Button>
    </div>
  </article>
</template>
