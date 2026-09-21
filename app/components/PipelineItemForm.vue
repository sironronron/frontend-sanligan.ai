<script setup lang="ts">
import { XIcon } from '@lucide/vue'
import type { Pipeline, PipelineItem, PipelineItemInput } from '~/types/pipeline'
import type { Client } from '~/types/client'

const props = defineProps<{
  pipeline: Pipeline
  clients: Client[]
  item?: PipelineItem | null
  busy?: boolean
  offline?: boolean
}>()

const emit = defineEmits<{
  submit: [payload: PipelineItemInput]
  cancel: []
}>()

const form = reactive<PipelineItemInput>({
  client_id: '',
  pipeline_id: props.pipeline.id,
  stage_id: props.pipeline.stages.find(stage => !stage.archived_at)?.id ?? '',
  title: '',
  source: '',
  note: '',
  next_action_at: null,
})
const errors = reactive<Record<string, string>>({})
const clientOptions = computed(() => props.clients.map(client => ({ value: client.id, label: client.display_name })))
const stageOptions = computed(() => props.pipeline.stages
  .filter(stage => !stage.archived_at)
  .sort((a, b) => a.position - b.position)
  .map(stage => ({ value: stage.id, label: stage.name })))

watch(() => props.item, (item) => {
  Object.assign(form, item ? {
    client_id: item.client_id,
    pipeline_id: item.pipeline_id,
    stage_id: item.stage_id,
    title: item.title,
    source: item.source ?? '',
    note: item.note ?? '',
    next_action_at: item.next_action_at,
  } : {
    client_id: '',
    pipeline_id: props.pipeline.id,
    stage_id: props.pipeline.stages.find(stage => !stage.archived_at)?.id ?? '',
    title: '',
    source: '',
    note: '',
    next_action_at: null,
  })
}, { immediate: true })

function submit() {
  Object.keys(errors).forEach(key => delete errors[key])
  if (!form.client_id) errors.client_id = 'Choose a client.'
  if (!form.stage_id) errors.stage_id = 'Choose a pipeline stage.'
  if (!form.title.trim()) errors.title = 'Enter an intake title.'
  if (form.title.length > 255) errors.title = 'Use 255 characters or fewer.'
  if (!Object.keys(errors).length) emit('submit', { ...form, title: form.title.trim() })
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 sm:items-center sm:p-4" @keydown.esc="!busy && emit('cancel')">
    <section role="dialog" aria-modal="true" aria-labelledby="item-form-title" class="max-h-[100dvh] w-full overflow-y-auto rounded-t-2xl bg-card p-5 shadow-float sm:max-w-xl sm:rounded-2xl sm:p-6">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-label">CRM / Intake</p>
          <h2 id="item-form-title" class="text-h2 font-semibold">{{ item ? 'Edit intake item' : 'New intake item' }}</h2>
          <p class="mt-1 text-sm text-muted-foreground">Pipeline stages track intake progress, not legal-case status.</p>
          <p v-if="offline" class="mt-2 text-sm text-amber-700 dark:text-amber-300" role="status">Reconnect before saving changes.</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close intake form" :disabled="busy" @click="emit('cancel')"><XIcon class="size-4" /></Button>
      </div>

      <div v-if="Object.keys(errors).length" role="alert" class="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">Fix the highlighted fields before saving.</div>

      <form class="mt-5 grid gap-4" @submit.prevent="submit">
        <div>
          <label for="item-client" class="text-sm font-medium">Client <span aria-hidden="true">*</span></label>
          <SearchableSelect
            id="item-client"
            v-model="form.client_id"
            :options="clientOptions"
            placeholder="Select a client…"
            search-placeholder="Search clients…"
            empty-label="No clients match your search."
            aria-describedby="item-client-error"
            :invalid="!!errors.client_id"
            :disabled="busy"
            class="mt-1.5"
          />
          <p v-if="errors.client_id" id="item-client-error" class="mt-1 text-xs text-destructive">{{ errors.client_id }}</p>
        </div>

        <div>
          <label for="item-stage" class="text-sm font-medium">Pipeline stage <span aria-hidden="true">*</span></label>
          <SearchableSelect
            id="item-stage"
            v-model="form.stage_id"
            :options="stageOptions"
            placeholder="Select a stage…"
            search-placeholder="Search stages…"
            empty-label="No active stages match your search."
            aria-describedby="item-stage-error"
            :invalid="!!errors.stage_id"
            :disabled="busy"
            class="mt-1.5"
          />
          <p v-if="errors.stage_id" id="item-stage-error" class="mt-1 text-xs text-destructive">{{ errors.stage_id }}</p>
        </div>

        <div>
          <label for="item-title" class="text-sm font-medium">Intake title <span aria-hidden="true">*</span></label>
          <Input id="item-title" v-model="form.title" class="mt-1.5 h-11" :aria-invalid="!!errors.title" :disabled="busy" />
          <p v-if="errors.title" class="mt-1 text-xs text-destructive">{{ errors.title }}</p>
        </div>

        <div>
          <label for="item-source" class="text-sm font-medium">Source</label>
          <Input id="item-source" v-model="form.source" class="mt-1.5 h-11" :disabled="busy" />
        </div>

        <div>
          <label for="item-note" class="text-sm font-medium">Intake note</label>
          <textarea id="item-note" v-model="form.note" class="mt-1.5 min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" :disabled="busy" />
        </div>

        <div>
          <label for="item-next-action" class="text-sm font-medium">Next action</label>
          <Input id="item-next-action" v-model="form.next_action_at" type="datetime-local" class="mt-1.5 h-11" :disabled="busy" />
        </div>

        <div class="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" class="min-h-11" :disabled="busy" @click="emit('cancel')">Cancel</Button>
          <Button type="submit" class="min-h-11" :disabled="busy || offline">{{ busy ? 'Saving…' : item ? 'Save changes' : 'Create intake' }}</Button>
        </div>
      </form>
    </section>
  </div>
</template>
