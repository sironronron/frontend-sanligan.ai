<script setup lang="ts">
import { FileTextIcon, ScaleIcon, XIcon } from '@lucide/vue'

export interface TemplateOption {
  id: string
  name: string
  category: 'formal' | 'basic' | 'legal' | 'custom'
  jurisdiction: string
  legal_subtype: string | null
  structure: string[]
  placeholder_fields: Array<{ key: string; label: string; required: boolean }> | string[]
  is_system: boolean
}

const props = defineProps<{
  templates: TemplateOption[]
  loading?: boolean
}>()

const emit = defineEmits<{
  select: [template: TemplateOption]
  cancel: []
}>()

const CATEGORY_LABELS: Record<TemplateOption['category'], string> = {
  legal: 'Legal (Philippine)',
  formal: 'Formal',
  basic: 'Basic',
  custom: 'Custom',
}

const CATEGORY_ORDER: TemplateOption['category'][] = ['legal', 'formal', 'basic', 'custom']

const grouped = computed(() => {
  const map: Record<string, TemplateOption[]> = {}
  for (const template of props.templates) {
    const list = map[template.category] ?? []
    list.push(template)
    map[template.category] = list
  }
  const ordered: Array<{ category: TemplateOption['category']; templates: TemplateOption[] }> = []
  for (const category of CATEGORY_ORDER) {
    if (map[category]?.length) {
      ordered.push({ category, templates: map[category] })
    }
  }
  return ordered
})

function humanizeSubtype(subtype: string | null) {
  if (!subtype) return ''
  return subtype.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-[2px]" @click="emit('cancel')" />
      <div class="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-2xl border-t bg-background shadow-2xl lg:inset-x-auto lg:right-0 lg:top-0 lg:bottom-0 lg:max-h-none lg:w-[440px] lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-xl">
        <div class="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/25 lg:hidden" />
        <div class="flex items-center justify-between border-b px-4 py-3">
          <div class="flex items-center gap-2">
            <FileTextIcon class="size-4 text-primary" />
            <h3 class="text-sm font-semibold">Draft a Letter</h3>
          </div>
          <Button variant="ghost" size="icon" class="size-7" @click="emit('cancel')">
            <XIcon class="size-4" />
          </Button>
        </div>

        <div class="flex-1 overflow-y-auto px-4 py-3">
          <p class="mb-4 text-xs text-muted-foreground">
            Choose a template to guide the letter. Saligan will fill it using this case's details.
          </p>

          <div v-if="loading" class="space-y-2">
            <Skeleton v-for="i in 4" :key="i" class="h-16 w-full rounded-lg" />
          </div>

          <div v-for="group in grouped" :key="group.category" class="mb-5">
            <p class="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <ScaleIcon v-if="group.category === 'legal'" class="size-3.5 text-primary" />
              {{ CATEGORY_LABELS[group.category] }}
            </p>

            <div v-if="group.category === 'legal'" class="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
              These templates follow common Philippine legal-correspondence conventions but are not a substitute for
              review by a licensed PH lawyer.
            </div>

            <div class="space-y-1.5">
              <button
                v-for="template in group.templates"
                :key="template.id"
                type="button"
                class="flex w-full items-start justify-between gap-2 rounded-lg border p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                @click="emit('select', template)"
              >
                <div class="min-w-0">
                  <p class="text-sm font-medium">{{ template.name }}</p>
                  <p v-if="template.legal_subtype" class="mt-0.5 text-[11px] text-muted-foreground">
                    {{ humanizeSubtype(template.legal_subtype) }}
                  </p>
                </div>
                <Badge v-if="group.category === 'legal'" variant="secondary" class="shrink-0 text-[10px]">
                  PH
                </Badge>
              </button>
            </div>
          </div>

          <p v-if="!loading && grouped.length === 0" class="py-8 text-center text-sm text-muted-foreground">
            No templates available yet.
          </p>
        </div>

        <div class="border-t px-4 py-3">
          <Button variant="outline" class="w-full" @click="emit('cancel')">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
