<script setup lang="ts">
import { ChevronDownIcon, PencilIcon, TagIcon, XIcon } from '@lucide/vue'
import type { LegalCase } from '~/stores/cases'

/**
 * The facts of the matter, pinned above the first message.
 *
 * This used to be a third row of the page header, which meant it cost vertical
 * space on every screen for the entire session — and the header was already
 * two rows deep before a single message was visible. It now sits pinned above
 * the scroller, full width with the header's padding, and collapses to a slim
 * bar once the detail is no longer needed.
 */
const props = defineProps<{
  case: LegalCase
  editable: boolean
}>()

const emit = defineEmits<{ edit: []; 'update-tags': [tags: string[]] }>()

const { typeLabel, formatDate, dueState } = useCasePresentation()

const open = ref(false)

const tagAdding = ref(false)
const tagInput = ref('')

function addTag() {
  const value = tagInput.value.trim()
  if (!value) return
  if (!props.case.tags.includes(value)) {
    emit('update-tags', [...props.case.tags, value])
  }
  tagInput.value = ''
  tagAdding.value = false
}

function removeTag(tag: string) {
  emit('update-tags', props.case.tags.filter((t) => t !== tag))
}

const due = computed(() => dueState(props.case.due_date))

const hasBody = computed(
  () =>
    !!props.case.description ||
    props.case.related_parties?.length > 0 ||
    props.case.tags?.length > 0 ||
    !!props.case.default_template,
)

/** Facts worth a labelled row rather than a chip. */
const rows = computed(() => {
  const c = props.case
  const out: Array<{ label: string; value: string; class?: string }> = []
  out.push({ label: 'Type', value: typeLabel(c.case_type) })
  if (c.reference) out.push({ label: 'Reference', value: c.reference })
  if (c.due_date) {
    out.push({ label: 'Deadline', value: `${formatDate(c.due_date)} — ${due.value?.label}`, class: due.value?.class })
  }
  if (c.related_parties?.length) out.push({ label: 'Parties', value: c.related_parties.join(', ') })
  if (c.default_template) out.push({ label: 'Template', value: c.default_template.name })
  return out
})
</script>

<template>
  <section v-if="hasBody || rows.length > 1" class="shrink-0 px-3 py-2.5">
    <div class="rounded-xl border bg-card">
      <button
        type="button"
        class="flex w-full items-center gap-2 px-4 py-2.5 text-left"
        :aria-expanded="open"
        @click="open = !open"
      >
        <span class="text-sm font-medium">Case brief</span>
        <span v-if="!open" class="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {{ props.case.description || rows.map((r) => r.value).join(' · ') }}
        </span>
        <span v-else class="flex-1" />
        <ChevronDownIcon
          class="size-4 shrink-0 text-muted-foreground transition-transform"
          :class="open ? '' : '-rotate-90'"
        />
      </button>

      <div v-if="open" class="space-y-3 border-t px-4 py-3">
        <p v-if="props.case.description" class="text-sm leading-relaxed text-muted-foreground">
          {{ props.case.description }}
        </p>

        <!--
          A label column, so the eye can find "Deadline" without reading the
          whole line. The old dot-separated run made every fact equally hard
          to locate.
        -->
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <template v-for="row in rows" :key="row.label">
            <dt class="text-muted-foreground">{{ row.label }}</dt>
            <dd :class="row.class ?? ''">{{ row.value }}</dd>
          </template>
        </dl>

        <div v-if="props.case.tags?.length || props.editable" class="space-y-1.5">
          <div v-if="props.case.tags?.length" class="flex flex-wrap items-center gap-1">
            <span
              v-for="tag in props.case.tags"
              :key="tag"
              class="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
            >
              {{ tag }}
              <button
                v-if="props.editable"
                type="button"
                :aria-label="`Remove tag ${tag}`"
                class="rounded text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                @click="removeTag(tag)"
              >
                <XIcon class="size-3" />
              </button>
            </span>
          </div>

          <div v-if="props.editable">
            <button
              v-if="!tagAdding"
              type="button"
              class="inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:border-solid hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              @click="tagAdding = true"
            >
              <TagIcon class="size-3" />
              Add tag
            </button>
            <div v-else class="flex items-center gap-1.5">
              <Input
                v-model="tagInput"
                class="h-7 w-40 text-xs"
                placeholder="Tag name…"
                autofocus
                @keydown.enter.prevent="addTag"
                @keydown.esc="tagAdding = false"
              />
              <Button size="sm" class="h-7 px-2.5 text-xs" :disabled="!tagInput.trim()" @click="addTag">Add</Button>
            </div>
          </div>
        </div>

        <Button v-if="props.editable" variant="ghost" size="xs" class="-ml-2 text-muted-foreground" @click="$emit('edit')">
          <PencilIcon />
          Edit case details
        </Button>
      </div>
    </div>
  </section>
</template>
