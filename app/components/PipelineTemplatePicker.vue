<script setup lang="ts">
import { CheckIcon } from '@lucide/vue'
import type { PipelineTemplate } from '~/types/pipeline'

const props = withDefaults(defineProps<{
  templates: PipelineTemplate[]
  loading?: boolean
  error?: unknown
  forbidden?: boolean
  busy?: boolean
  submitLabel?: string
  // Display hint only; the approved default per ADR-013. Never grants behavior.
  recommendedKey?: string
}>(), { loading: false, error: null, forbidden: false, busy: false, submitLabel: 'Confirm setup', recommendedKey: 'standard_intake_v1' })

const emit = defineEmits<{ select: [key: string | undefined]; confirm: []; retry: [] }>()
const selected = ref<string | undefined>()
const selectedTemplate = computed(() => props.templates.find(template => template.template_key === selected.value))

function choose(key: string | undefined) { selected.value = key; emit('select', key) }

function terminalSummary(template: PipelineTemplate) {
  const labels = [...new Set(
    template.stages
      .map(stage => stage.outcome_kind === 'won' ? 'Won' : stage.outcome_kind === 'not_proceeding' ? 'Not proceeding' : null)
      .filter((label): label is string => label !== null),
  )]
  return `${template.stages.length} stages${labels.length ? ` · ends in ${labels.join(' or ')}` : ''}`
}
</script>
<template>
  <section aria-labelledby="pipeline-template-title" class="surface-inset mt-5 p-4 sm:p-6">
    <h2 id="pipeline-template-title" tabindex="-1" class="text-lg font-semibold">Choose an approved intake template</h2>
    <p class="mt-1 text-sm text-muted-foreground">Select one template to configure the pipeline. You can edit stages later.</p>
    <div v-if="forbidden" class="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm" role="alert">You do not have permission to configure pipelines.</div>
    <div v-else-if="loading" class="mt-5 grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Loading approved templates"><Skeleton v-for="i in 3" :key="i" class="h-44 rounded-xl" /></div>
    <div v-else-if="error" class="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4" role="alert"><p>Approved templates could not load. No pipeline was changed.</p><Button variant="outline" class="mt-3 min-h-11" @click="emit('retry')">Retry</Button></div>
    <div v-else-if="!templates.length" class="mt-4 rounded-lg border p-4 text-sm"><p>No approved templates are available. You can use the approved default stages.</p><Button class="mt-3 min-h-11" :disabled="busy" @click="choose(undefined); emit('confirm')">{{ submitLabel }} with approved default</Button></div>
    <template v-else>
      <div class="mt-5 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Approved pipeline templates">
        <button
          v-for="template in templates"
          :key="template.template_key"
          type="button"
          role="radio"
          :aria-checked="selected === template.template_key"
          :disabled="busy"
          class="surface-interactive min-h-11 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :class="selected === template.template_key ? 'border-primary ring-1 ring-primary' : ''"
          @click="choose(template.template_key)"
        >
          <span class="flex items-start gap-2">
            <span class="min-w-0 flex-1">
              <span class="flex flex-wrap items-center gap-2">
                <span class="font-semibold">{{ template.name }}</span>
                <Badge v-if="template.template_key === recommendedKey" variant="secondary">Recommended</Badge>
              </span>
              <span class="mt-1 block text-sm text-muted-foreground">{{ template.description }}</span>
              <span class="mt-1 block text-xs text-muted-foreground">{{ terminalSummary(template) }}</span>
            </span>
            <span
              v-if="selected === template.template_key"
              class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
              aria-hidden="true"
            >
              <CheckIcon class="size-4" />
            </span>
          </span>
          <PipelineTemplateStagePreview :stages="template.stages" />
        </button>
      </div>
      <p v-if="selectedTemplate" class="sr-only" aria-live="polite">{{ selectedTemplate.name }} selected.</p>
      <Button class="mt-5 min-h-11" :disabled="!selected || busy" :aria-busy="busy" @click="emit('confirm')">{{ busy ? 'Setting up…' : submitLabel }}</Button>
    </template>
  </section>
</template>
