<script setup lang="ts">
/**
 * Case intake, in two shapes from one form.
 *
 * Creating and editing a case are not the same job. A new case starts from
 * nothing and only three of its ten fields are required, so presenting all ten
 * at once made a two-field task look like a ten-field one and buried the two
 * that actually gate the submit. Creation is therefore a three-step wizard —
 * Basics, Context, Review — that asks for the required fields first and treats
 * everything else as optional depth.
 *
 * Editing is the opposite: every field already has a value the user came to
 * find, and paging through three screens to change a due date would be worse
 * than the flat form was. Edit mode renders the same three groups stacked in
 * one scroll, with headings instead of steps.
 *
 * The wizard never traps anyone: once the title is valid, "Skip & create"
 * finishes from any step, so the guided path is an offer rather than a toll.
 */
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  Building2Icon,
  CalendarIcon,
  CheckIcon,
  ClipboardListIcon,
  FolderIcon,
  HeadsetIcon,
  Loader2Icon,
  PlusIcon,
  ScaleIcon,
  UsersIcon,
  XIcon,
} from '@lucide/vue'
import type { Component } from 'vue'
import { CASE_PRIORITIES, CASE_STATUSES, CASE_TYPES } from '~/stores/cases'

export interface IntakeTemplateOption {
  id: string
  name: string
  category: string
}

export interface CaseIntakePayload {
  title: string
  case_type: string
  reference?: string | null
  priority?: string | null
  status: string
  description?: string | null
  related_parties?: string[]
  due_date?: string | null
  tags?: string[]
  default_template_id?: string | null
}

const props = defineProps<{
  initial?: Partial<CaseIntakePayload> | null
  templates?: IntakeTemplateOption[]
  submitLabel?: string
  /** Disables the footer while the caller's request is in flight. */
  busy?: boolean
}>()

const emit = defineEmits<{
  submit: [payload: CaseIntakePayload]
  cancel: []
}>()

interface IntakeFormState {
  title: string
  case_type: string
  reference: string
  priority: string
  status: string
  description: string
  related_parties: string[]
  due_date: string
  tags: string[]
  default_template_id: string
}

const NO_TEMPLATE = 'none'

const { typeLabel, priorityLabel, priorityClass, dueState } = useCasePresentation()

const isEdit = computed(() => !!props.initial)

const form = reactive<IntakeFormState>({
  title: props.initial?.title ?? '',
  case_type: props.initial?.case_type ?? 'legal',
  reference: props.initial?.reference ?? '',
  priority: props.initial?.priority ?? 'medium',
  status: props.initial?.status ?? 'open',
  description: props.initial?.description ?? '',
  related_parties: props.initial?.related_parties?.length ? [...props.initial.related_parties] : [''],
  due_date: props.initial?.due_date ?? '',
  tags: props.initial?.tags ?? [],
  default_template_id: props.initial?.default_template_id ?? NO_TEMPLATE,
})

/** A face for each case type, so the choice is scannable rather than read. */
const TYPE_ICONS: Record<string, Component> = {
  legal: ScaleIcon,
  hr: UsersIcon,
  customer_support: HeadsetIcon,
  administrative: Building2Icon,
  general: FolderIcon,
}

const STEPS = [
  { key: 'basics', label: 'Basics' },
  { key: 'context', label: 'Context' },
  { key: 'review', label: 'Review' },
] as const

const LAST_STEP = STEPS.length - 1

const step = ref(0)
/** How far the user has got, so the stepper can offer a step it has shown. */
const furthest = ref(0)
const tagInput = ref('')
const validationError = ref('')
const panel = ref<HTMLElement | null>(null)

const hasTitle = computed(() => form.title.trim().length > 0)

const parties = computed(() => form.related_parties.map((p) => p.trim()).filter(Boolean))

const selectedTemplate = computed(() =>
  (props.templates ?? []).find((t) => t.id === form.default_template_id) ?? null,
)

const due = computed(() => dueState(form.due_date || null))

const submitText = computed(() => props.submitLabel ?? (isEdit.value ? 'Save Changes' : 'Create Case'))

/**
 * Every step but the first is optional, so only the first can block. Keeping
 * the check keyed by step means adding a required field later has one place to
 * go.
 */
function validateStep(index: number) {
  if (index === 0 && !hasTitle.value) {
    validationError.value = 'A case title is required.'
    return false
  }
  validationError.value = ''
  return true
}

function focusFirstField() {
  void nextTick(() => {
    const active = panel.value?.querySelector<HTMLElement>('[data-step-panel]:not([hidden]) [data-autofocus]')
    active?.focus()
  })
}

function goTo(index: number) {
  // Backwards is always free; forwards has to clear the steps it skips over.
  if (index > step.value && !validateStep(step.value)) return
  step.value = Math.min(Math.max(index, 0), LAST_STEP)
  furthest.value = Math.max(furthest.value, step.value)
  focusFirstField()
}

function goNext() {
  if (step.value < LAST_STEP) goTo(step.value + 1)
}

function goBack() {
  if (step.value > 0) goTo(step.value - 1)
}

function addParty() {
  form.related_parties = [...form.related_parties, '']
  void nextTick(() => {
    const inputs = panel.value?.querySelectorAll<HTMLInputElement>('[data-party-input]')
    inputs?.[inputs.length - 1]?.focus()
  })
}

function removeParty(index: number) {
  if (form.related_parties.length > 1) {
    form.related_parties = form.related_parties.filter((_, i) => i !== index)
  } else {
    form.related_parties = ['']
  }
}

function addTag() {
  const tag = tagInput.value.trim()
  if (!tag) return
  if (!form.tags.includes(tag)) {
    form.tags = [...form.tags, tag]
  }
  tagInput.value = ''
}

function removeTag(tag: string) {
  form.tags = form.tags.filter((t) => t !== tag)
}

function handleKeydownTag(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault()
    addTag()
    return
  }
  // Backspace on an empty box takes back the last chip, the behaviour every
  // other tag field has trained people to expect.
  if (event.key === 'Backspace' && !tagInput.value && form.tags.length) {
    form.tags = form.tags.slice(0, -1)
  }
}

/** Deadlines are nearly always "a week out", not a date anyone looks up. */
function setDueIn(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  form.due_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function buildPayload(): CaseIntakePayload {
  return {
    title: form.title.trim(),
    case_type: form.case_type,
    status: form.status,
    priority: form.priority || null,
    reference: form.reference.trim() ? form.reference.trim() : null,
    description: form.description.trim() ? form.description.trim() : null,
    related_parties: parties.value,
    due_date: form.due_date || null,
    tags: form.tags.filter(Boolean),
    default_template_id:
      form.default_template_id && form.default_template_id !== NO_TEMPLATE ? form.default_template_id : null,
  }
}

function submitNow() {
  if (props.busy) return
  if (!validateStep(0)) {
    // The offending field lives on the first step, so go where the error is.
    if (!isEdit.value) goTo(0)
    focusFirstField()
    return
  }
  emit('submit', buildPayload())
}

/**
 * Enter anywhere in the form means "the obvious next thing": advance the
 * wizard, or commit on the last step and in edit mode.
 */
function handleSubmit() {
  if (!isEdit.value && step.value < LAST_STEP) {
    goNext()
    return
  }
  submitNow()
}

/** Dismissal is refused mid-write, so a half-sent case cannot be abandoned. */
function requestCancel() {
  if (!props.busy) emit('cancel')
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    requestCancel()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  focusFirstField()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="case-drawer" appear>
    <div class="fixed inset-0 z-50">
      <div
        class="case-backdrop absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        @click="requestCancel"
      />
      <div
        ref="panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="case-intake-heading"
        class="case-panel absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-2xl border-t bg-background shadow-2xl lg:inset-x-auto lg:top-0 lg:right-0 lg:bottom-0 lg:max-h-none lg:w-[480px] lg:rounded-none lg:border-t-0 lg:border-l lg:shadow-xl"
      >
        <div class="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/25 lg:hidden" />

        <div class="flex items-center justify-between px-4 py-3">
          <div class="flex items-center gap-2">
            <ClipboardListIcon class="size-4 text-primary" />
            <h3 id="case-intake-heading" class="text-sm font-semibold">
              {{ isEdit ? 'Edit Case' : 'New Case' }}
            </h3>
          </div>
          <Button variant="ghost" size="icon" class="size-7" aria-label="Close" @click="requestCancel">
            <XIcon class="size-4" />
          </Button>
        </div>

        <!--
          The stepper doubles as navigation: a step already seen is one click
          away, which is what makes the "Review" screen safe to edit from.
        -->
        <nav v-if="!isEdit" class="flex items-center gap-1.5 border-b px-4 pb-3" aria-label="Case creation steps">
          <template v-for="(s, index) in STEPS" :key="s.key">
            <button
              type="button"
              class="flex shrink-0 items-center gap-1.5 rounded-md py-0.5 transition-opacity focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              :class="index > furthest ? 'opacity-50' : 'hover:opacity-80'"
              :aria-current="step === index ? 'step' : undefined"
              @click="goTo(index)"
            >
              <span
                class="inline-flex size-5 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors"
                :class="
                  index < step
                    ? 'border-primary bg-primary text-primary-foreground'
                    : index === step
                      ? 'border-primary text-primary'
                      : 'border-border text-muted-foreground'
                "
              >
                <CheckIcon v-if="index < step" class="size-3" />
                <template v-else>{{ index + 1 }}</template>
              </span>
              <span
                class="text-xs font-medium"
                :class="index === step ? 'text-foreground' : 'text-muted-foreground'"
              >
                {{ s.label }}
              </span>
            </button>
            <span
              v-if="index < STEPS.length - 1"
              class="h-px min-w-2 flex-1 transition-colors"
              :class="index < step ? 'bg-primary/50' : 'bg-border'"
            />
          </template>
        </nav>

        <form class="flex flex-1 flex-col overflow-y-auto" @submit.prevent="handleSubmit">
          <div class="flex-1 space-y-4 px-4 pt-4 pb-2">
            <!-- Step 1 — Basics: the three fields the server actually requires. -->
            <section v-show="isEdit || step === 0" data-step-panel :hidden="!isEdit && step !== 0" class="space-y-4">
              <p v-if="isEdit" class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Basics</p>

              <div class="space-y-1.5">
                <Label for="case-title" class="text-xs">
                  Case Title <span class="text-destructive">*</span>
                </Label>
                <Input
                  id="case-title"
                  v-model="form.title"
                  data-autofocus
                  class="text-sm"
                  placeholder="e.g. Unpaid rent — Dela Cruz"
                  :aria-invalid="!!validationError && !hasTitle"
                />
                <p class="text-xs text-muted-foreground">A short name you will recognise in the case list.</p>
              </div>

              <div class="space-y-1.5">
                <Label class="text-xs">
                  Case Type <span class="text-destructive">*</span>
                </Label>
                <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <button
                    v-for="type in CASE_TYPES"
                    :key="type.value"
                    type="button"
                    class="flex flex-col items-start gap-1.5 rounded-lg border p-2.5 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    :class="
                      form.case_type === type.value
                        ? 'border-primary bg-primary/5'
                        : 'hover:border-foreground/20 hover:bg-muted/50'
                    "
                    :aria-pressed="form.case_type === type.value"
                    @click="form.case_type = type.value"
                  >
                    <component
                      :is="TYPE_ICONS[type.value] ?? FolderIcon"
                      class="size-4"
                      :class="form.case_type === type.value ? 'text-primary' : 'text-muted-foreground'"
                    />
                    <span class="text-xs leading-tight font-medium">{{ type.label }}</span>
                  </button>
                </div>
              </div>

              <div class="space-y-1.5">
                <Label class="text-xs">
                  Status <span class="text-destructive">*</span>
                </Label>
                <div class="flex items-center overflow-x-auto rounded-lg border bg-muted/40 p-0.5">
                  <button
                    v-for="s in CASE_STATUSES"
                    :key="s.value"
                    type="button"
                    class="inline-flex h-7 flex-1 shrink-0 items-center justify-center rounded-md px-2 text-xs font-medium transition-colors"
                    :class="
                      form.status === s.value
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    "
                    :aria-pressed="form.status === s.value"
                    @click="form.status = s.value"
                  >
                    {{ s.label }}
                  </button>
                </div>
              </div>

              <div class="space-y-1.5">
                <Label class="text-xs">Priority</Label>
                <div class="flex items-center overflow-x-auto rounded-lg border bg-muted/40 p-0.5">
                  <button
                    v-for="p in CASE_PRIORITIES"
                    :key="p.value"
                    type="button"
                    class="inline-flex h-7 flex-1 shrink-0 items-center justify-center rounded-md px-2 text-xs font-medium transition-colors"
                    :class="
                      form.priority === p.value
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    "
                    :aria-pressed="form.priority === p.value"
                    @click="form.priority = p.value"
                  >
                    {{ p.label }}
                  </button>
                </div>
              </div>
            </section>

            <!-- Step 2 — Context: the facts the assistant reads off the case. -->
            <section
              v-show="isEdit || step === 1"
              data-step-panel
              :hidden="!isEdit && step !== 1"
              class="space-y-4"
              :class="isEdit ? 'border-t pt-4' : ''"
            >
              <p v-if="isEdit" class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Context</p>
              <p v-else class="text-xs text-muted-foreground">
                Optional, but everything here becomes background the assistant can use.
              </p>

              <div class="space-y-1.5">
                <Label for="case-description" class="text-xs">Description / Summary</Label>
                <Textarea
                  id="case-description"
                  v-model="form.description"
                  data-autofocus
                  rows="4"
                  class="resize-none text-sm"
                  placeholder="What happened, who is involved, and what the client wants."
                />
              </div>

              <div class="space-y-1.5">
                <Label class="text-xs">Related Parties</Label>
                <div v-for="(party, index) in form.related_parties" :key="index" class="flex items-center gap-2">
                  <Input
                    v-model="form.related_parties[index]"
                    data-party-input
                    class="text-sm"
                    placeholder="Name and role, e.g. Maria Santos (claimant)"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    class="size-8 shrink-0"
                    :aria-label="`Remove party ${index + 1}`"
                    :disabled="form.related_parties.length === 1 && !form.related_parties[0]"
                    @click="removeParty(index)"
                  >
                    <XIcon class="size-3.5" />
                  </Button>
                </div>
                <Button type="button" variant="outline" size="sm" class="gap-1 text-xs" @click="addParty">
                  <PlusIcon class="size-3.5" />
                  Add party
                </Button>
              </div>

              <div class="space-y-1.5">
                <Label for="case-due-date" class="text-xs">Due Date / Deadline</Label>
                <Input id="case-due-date" v-model="form.due_date" type="date" class="text-sm" />
                <div class="flex flex-wrap items-center gap-1.5">
                  <Button type="button" variant="outline" size="xs" @click="setDueIn(7)">In a week</Button>
                  <Button type="button" variant="outline" size="xs" @click="setDueIn(30)">In 30 days</Button>
                  <Button v-if="form.due_date" type="button" variant="ghost" size="xs" @click="form.due_date = ''">
                    Clear
                  </Button>
                  <span v-if="due" class="ml-auto text-xs" :class="due.class">{{ due.label }}</span>
                </div>
              </div>
            </section>

            <!-- Step 3 — Review: filing details, then what is about to be created. -->
            <section
              v-show="isEdit || step === 2"
              data-step-panel
              :hidden="!isEdit && step !== 2"
              class="space-y-4"
              :class="isEdit ? 'border-t pt-4' : ''"
            >
              <p v-if="isEdit" class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Filing</p>

              <div class="grid grid-cols-2 gap-3">
                <div class="space-y-1.5">
                  <Label for="case-reference" class="text-xs">Case Reference</Label>
                  <Input
                    id="case-reference"
                    v-model="form.reference"
                    data-autofocus
                    class="text-sm"
                    placeholder="Auto-generated"
                  />
                </div>

                <div class="space-y-1.5">
                  <Label for="case-template" class="text-xs">Default Template</Label>
                  <Select v-model="form.default_template_id">
                    <SelectTrigger id="case-template" class="w-full text-sm">
                      <SelectValue :placeholder="'None'" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem :value="NO_TEMPLATE">None</SelectItem>
                      <SelectItem v-for="template in props.templates ?? []" :key="template.id" :value="template.id">
                        {{ template.name }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div class="space-y-1.5">
                <Label for="case-tags" class="text-xs">Tags</Label>
                <div class="flex flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5">
                  <span
                    v-for="tag in form.tags"
                    :key="tag"
                    class="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
                  >
                    {{ tag }}
                    <button
                      type="button"
                      :aria-label="`Remove tag: ${tag}`"
                      class="rounded text-muted-foreground hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                      @click="removeTag(tag)"
                    >
                      <XIcon class="size-3" />
                    </button>
                  </span>
                  <input
                    id="case-tags"
                    v-model="tagInput"
                    class="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    placeholder="Type a tag and press Enter"
                    @keydown="handleKeydownTag"
                  />
                </div>
              </div>

              <!--
                Only creation gets a summary. In edit mode the fields above are
                already filled in with the answer, so restating them would be
                the same screen twice.
              -->
              <div v-if="!isEdit" class="rounded-xl border bg-muted/30 p-3">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="truncate text-[11px] tracking-wide text-muted-foreground uppercase">
                      {{ form.reference.trim() || 'Reference auto-generated' }}
                    </p>
                    <p class="truncate text-sm font-semibold">{{ form.title.trim() || 'Untitled case' }}</p>
                  </div>
                  <Button type="button" variant="ghost" size="xs" class="shrink-0" @click="goTo(0)">Edit</Button>
                </div>

                <div class="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" class="bg-card">{{ typeLabel(form.case_type) }}</Badge>
                  <CaseStatusBadge :status="form.status" />
                  <!--
                    The shared priority badge carries a top margin for the list
                    rows it was built for, which would knock it off the
                    baseline here; the tint is the part worth sharing.
                  -->
                  <Badge v-if="form.priority" variant="outline" :class="priorityClass(form.priority)">
                    {{ priorityLabel(form.priority) }}
                  </Badge>
                  <span v-if="due" class="inline-flex items-center gap-1 text-xs" :class="due.class">
                    <CalendarIcon class="size-3" />
                    {{ due.label }}
                  </span>
                </div>

                <dl class="mt-3 space-y-1 border-t pt-2 text-xs">
                  <div class="flex gap-2">
                    <dt class="w-20 shrink-0 text-muted-foreground">Parties</dt>
                    <dd class="min-w-0 flex-1 truncate">
                      {{ parties.length ? parties.join(', ') : '—' }}
                    </dd>
                  </div>
                  <div class="flex gap-2">
                    <dt class="w-20 shrink-0 text-muted-foreground">Summary</dt>
                    <dd class="min-w-0 flex-1 truncate">{{ form.description.trim() || '—' }}</dd>
                  </div>
                  <div class="flex gap-2">
                    <dt class="w-20 shrink-0 text-muted-foreground">Tags</dt>
                    <dd class="min-w-0 flex-1 truncate">{{ form.tags.length ? form.tags.join(', ') : '—' }}</dd>
                  </div>
                  <div class="flex gap-2">
                    <dt class="w-20 shrink-0 text-muted-foreground">Template</dt>
                    <dd class="min-w-0 flex-1 truncate">{{ selectedTemplate?.name ?? 'None' }}</dd>
                  </div>
                </dl>

                <p class="mt-2 border-t pt-2 text-xs text-muted-foreground">
                  A “General” thread opens with the case, ready for questions and drafting.
                </p>
              </div>
            </section>

            <p
              v-if="validationError"
              role="alert"
              class="flex items-center gap-1.5 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <AlertCircleIcon class="size-3.5 shrink-0" />
              {{ validationError }}
            </p>
          </div>

          <div class="sticky bottom-0 flex items-center gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur">
            <Button
              v-if="!isEdit && step > 0"
              type="button"
              variant="outline"
              size="lg"
              class="gap-1.5"
              :disabled="props.busy"
              @click="goBack"
            >
              <ArrowLeftIcon class="size-4" />
              Back
            </Button>
            <Button v-else type="button" variant="outline" size="lg" :disabled="props.busy" @click="requestCancel">
              Cancel
            </Button>

            <!--
              The wizard is guidance, not a gate: once the case has a name it
              can be filed from any step, and the remaining fields are all
              editable afterwards anyway.
            -->
            <Button
              v-if="!isEdit && step < LAST_STEP && hasTitle"
              type="button"
              variant="ghost"
              size="lg"
              class="ml-auto text-muted-foreground"
              :disabled="props.busy"
              @click="submitNow"
            >
              Skip &amp; create
            </Button>

            <Button
              v-if="!isEdit && step < LAST_STEP"
              type="submit"
              size="lg"
              class="gap-1.5"
              :class="hasTitle ? '' : 'ml-auto'"
              :disabled="props.busy"
            >
              Next
              <ArrowRightIcon class="size-4" />
            </Button>
            <Button v-else type="submit" size="lg" class="ml-auto gap-1.5" :disabled="props.busy">
              <Loader2Icon v-if="props.busy" class="size-4 animate-spin" />
              {{ submitText }}
            </Button>
          </div>
        </form>
      </div>
    </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.case-drawer-enter-active .case-panel,
.case-drawer-leave-active .case-panel {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.case-drawer-enter-from .case-panel,
.case-drawer-leave-to .case-panel {
  transform: translateY(100%);
}

.case-drawer-enter-active .case-backdrop,
.case-drawer-leave-active .case-backdrop {
  transition: opacity 0.3s ease;
}

.case-drawer-enter-from .case-backdrop,
.case-drawer-leave-to .case-backdrop {
  opacity: 0;
}

@media (min-width: 1024px) {
  .case-drawer-enter-from .case-panel,
  .case-drawer-leave-to .case-panel {
    transform: translateX(100%);
  }
}
</style>
