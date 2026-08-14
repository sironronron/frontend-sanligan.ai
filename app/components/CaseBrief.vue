<script setup lang="ts">
import { CheckIcon, ChevronDownIcon, TagIcon, XIcon } from '@lucide/vue'
import { CASE_STATUSES, type LegalCase } from '~/stores/cases'

/**
 * The facts of the matter.
 *
 * Two callers, two shapes. On mobile it sits above the thread as a disclosure,
 * so it costs one line until asked for. In the case rail it is the whole Brief
 * tab, which already has its own scroller and already shows the title, status
 * and priority in the pinned header above it — so there it drops both its
 * accordion chrome and its identity block and renders as a plain panel.
 */
const props = withDefaults(defineProps<{
  case: LegalCase
  editable: boolean
  /** Wrap the facts in a disclosure. Off when the caller is itself a panel. */
  collapsible?: boolean
  /** Repeat the title, status and priority. Off when the caller already shows them. */
  showIdentity?: boolean
}>(), { collapsible: true, showIdentity: true })

const emit = defineEmits<{ 'update-tags': [tags: string[]]; changeStatus: [status: LegalCase['status']] }>()

const { typeLabel, formatDate, dueState } = useCasePresentation()

const open = ref(!props.collapsible)

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
  out.push({ label: 'Category', value: typeLabel(c.case_type) })
  if (c.reference) out.push({ label: 'Case reference', value: c.reference })
  if (c.due_date) {
    out.push({ label: 'Deadline', value: `${formatDate(c.due_date)} — ${due.value?.label}`, class: due.value?.class })
  }
  if (c.related_parties?.length) out.push({ label: 'Parties', value: c.related_parties.join(', ') })
  if (c.default_template) out.push({ label: 'Template', value: c.default_template.name })
  return out
})
</script>

<template>
  <section
    v-if="!props.collapsible || hasBody || rows.length > 1"
    :class="props.collapsible ? 'shrink-0 border-b bg-card' : ''"
  >
    <button
      v-if="props.collapsible"
      type="button"
      class="flex w-full items-center gap-2 px-3 py-2.5 text-left"
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

    <div
      v-if="open"
      class="space-y-4 px-3 py-3.5"
      :class="props.collapsible ? 'max-h-72 overflow-y-auto border-t' : ''"
    >
      <div v-if="props.showIdentity">
        <p class="font-heading text-lg font-semibold leading-snug tracking-tight">{{ props.case.title }}</p>
        <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
          <DropdownMenu v-if="props.editable">
            <DropdownMenuTrigger
              class="shrink-0 rounded-4xl"
              :aria-label="`Case status: ${props.case.status}`"
            >
              <CaseStatusBadge :status="props.case.status" interactive>
                <ChevronDownIcon class="size-3 opacity-60" />
              </CaseStatusBadge>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" class="w-40">
              <DropdownMenuLabel class="text-xs text-muted-foreground">Move case to</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                v-for="option in CASE_STATUSES"
                :key="option.value"
                @click="emit('changeStatus', option.value as LegalCase['status'])"
              >
                <CheckIcon v-if="props.case.status === option.value" class="size-4 text-primary" />
                <span v-else class="size-4" aria-hidden="true" />
                {{ option.label }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <CaseStatusBadge v-else :status="props.case.status" />
          <CasePriorityBadge :priority="props.case.priority" show-quiet />
        </div>
      </div>

      <p v-if="props.case.description" class="text-sm leading-relaxed text-muted-foreground">
        {{ props.case.description }}
      </p>

      <!--
        A label column, so the eye can find "Deadline" without reading the
        whole line. The old dot-separated run made every fact equally hard
        to locate.
      -->
      <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
        <template v-for="row in rows" :key="row.label">
          <dt class="text-muted-foreground">{{ row.label }}</dt>
          <dd :class="row.class ?? ''">{{ row.value }}</dd>
        </template>
      </dl>

      <div v-if="props.case.tags?.length || props.editable" class="space-y-2">
        <div v-if="props.case.tags?.length" class="flex flex-wrap items-center gap-1.5">
          <span
            v-for="tag in props.case.tags"
            :key="tag"
            class="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs"
          >
            {{ tag }}
            <button
              v-if="props.editable"
              type="button"
              :aria-label="`Remove tag ${tag}`"
              class="rounded text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              @click="removeTag(tag)"
            >
              <XIcon class="size-3.5" />
            </button>
          </span>
        </div>

        <div v-if="props.editable">
          <button
            v-if="!tagAdding"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md border border-dashed bg-muted/45 px-2 py-1 text-xs text-muted-foreground hover:border-solid hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            @click="tagAdding = true"
          >
            <TagIcon class="size-3.5" />
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
    </div>
  </section>
</template>
