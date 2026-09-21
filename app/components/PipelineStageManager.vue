<script setup lang="ts">
import { ArchiveIcon, ChevronDownIcon, ChevronUpIcon, PlusIcon, RotateCcwIcon } from '@lucide/vue'
import type { Pipeline, PipelineOutcome, PipelineStage } from '~/types/pipeline'

const props = defineProps<{ pipeline: Pipeline; busy?: boolean; readonly?: boolean }>()
const emit = defineEmits<{ create: [name: string, outcome_kind: PipelineOutcome]; rename: [stage: PipelineStage, name: string]; reorder: [ids: string[]]; archive: [stage: PipelineStage]; restore: [stage: PipelineStage] }>()
const name = ref('')
const outcome = ref<PipelineOutcome>('open')
const editing = ref<string | null>(null)
const editName = ref('')
const stages = computed(() => [...props.pipeline.stages].sort((a, b) => a.position - b.position))
const activeStages = computed(() => stages.value.filter(stage => !stage.archived_at))

function add() {
  if (name.value.trim()) {
    emit('create', name.value.trim(), outcome.value)
    name.value = ''
  }
}

function activePosition(stage: PipelineStage) {
  return activeStages.value.findIndex(item => item.id === stage.id)
}

function move(stage: PipelineStage, direction: -1 | 1) {
  const ids = activeStages.value.map(item => item.id)
  const index = ids.indexOf(stage.id)
  const next = index + direction
  if (index >= 0 && next >= 0 && next < ids.length) {
    ;[ids[index], ids[next]] = [ids[next], ids[index]]
    emit('reorder', ids)
  }
}
</script>

<template>
  <section class="surface p-4 sm:p-5">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h2 class="font-semibold">Pipeline stages</h2>
        <p class="mt-1 text-sm text-muted-foreground">Order here controls the board. Stages are not legal-case statuses.</p>
      </div>
    </div>
    <form class="mt-4 grid gap-2 sm:grid-cols-[1fr_10rem_auto]" @submit.prevent="add">
      <Input v-model="name" aria-label="New stage name" placeholder="Stage name" class="h-11" :disabled="readonly" />
      <Select v-model="outcome" :disabled="readonly">
        <SelectTrigger class="h-11 w-full" aria-label="Stage outcome">
          <SelectValue placeholder="Stage outcome" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="won">Won</SelectItem>
            <SelectItem value="not_proceeding">Not proceeding</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <Button type="submit" class="min-h-11 gap-1" :disabled="readonly || busy || !name.trim()"><PlusIcon class="size-4" /> Add stage</Button>
    </form>
    <ol class="mt-5 grid gap-2" aria-label="Ordered pipeline stages">
      <li v-for="stage in stages" :key="stage.id" class="flex flex-wrap items-center gap-2 rounded-lg border p-3" :class="stage.archived_at ? 'opacity-60' : ''">
        <span class="w-6 text-center text-xs text-muted-foreground">{{ stage.archived_at ? '—' : activePosition(stage) + 1 }}</span>
        <template v-if="editing === stage.id"><Input v-model="editName" class="h-10 min-w-40 flex-1" :aria-label="`Rename ${stage.name}`" /><Button size="sm" class="min-h-10" :disabled="busy || !editName.trim()" @click="emit('rename', stage, editName.trim()); editing = null">Save</Button><Button size="sm" variant="ghost" class="min-h-10" @click="editing = null">Cancel</Button></template>
        <template v-else><span class="min-w-32 flex-1 font-medium">{{ stage.name }}</span><span class="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">{{ stage.outcome_kind === 'open' ? 'Open' : stage.outcome_kind === 'won' ? 'Won' : 'Not proceeding' }}</span><template v-if="!readonly && !stage.archived_at"><Button variant="ghost" size="icon" class="size-10" :disabled="busy || activePosition(stage) === 0" :aria-label="`Move ${stage.name} up`" @click="move(stage, -1)"><ChevronUpIcon class="size-4" /></Button><Button variant="ghost" size="icon" class="size-10" :disabled="busy || activePosition(stage) === activeStages.length - 1" :aria-label="`Move ${stage.name} down`" @click="move(stage, 1)"><ChevronDownIcon class="size-4" /></Button><Button variant="ghost" size="icon" class="size-10" :disabled="busy" :aria-label="`Rename ${stage.name}`" @click="editing = stage.id; editName = stage.name">✎</Button><Button variant="ghost" size="icon" class="size-10" :disabled="busy" :aria-label="`Archive ${stage.name}`" @click="emit('archive', stage)"><ArchiveIcon class="size-4" /></Button></template><Button v-if="!readonly && stage.archived_at" variant="ghost" size="icon" class="size-10" :disabled="busy" :aria-label="`Restore ${stage.name}`" @click="emit('restore', stage)"><RotateCcwIcon class="size-4" /></Button></template>
      </li>
    </ol>
  </section>
</template>
