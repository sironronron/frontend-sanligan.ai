<script lang="ts">
export interface IntakeField {
  key: string
  label: string
  type: 'text' | 'date' | 'number' | 'select' | 'textarea' | 'radio' | 'checkbox'
  options?: string[]
  required: boolean
  section?: string
  conditional?: { field: string, values: string[] }
}
</script>

<script setup lang="ts">
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ClipboardListIcon,
  PencilLineIcon,
} from '@lucide/vue'

/**
 * The facts the assistant needs before it can draft.
 *
 * One question at a time, because a legal intake form asked all at once is a
 * wall the reader abandons. That shape is only tolerable with the things the
 * previous version lacked:
 *
 * - **A way back.** It was forward-only, so a typo three fields ago could not
 *   be fixed at all.
 * - **A review step.** Submitting was a leap of faith over answers the user
 *   could no longer see, on a form whose whole purpose is factual accuracy.
 * - **Answers that survive.** Every keystroke lived in this component, which
 *   unmounts when the form is dismissed — closing it to re-read the thread
 *   destroyed everything typed so far. The values now live on the turn, and
 *   are handed up on every change.
 * - **Errors on the field.** A banner listing labels made the reader hunt for
 *   which step was wrong.
 */
const props = withDefaults(defineProps<{
  fields: IntakeField[]
  initialValues?: Record<string, string>
  /** Answers already typed this session, restored on remount. */
  draft?: Record<string, string>
  title?: string
  description?: string
  submitLabel?: string
  busy?: boolean
}>(), {
  initialValues: () => ({}),
  draft: () => ({}),
  title: 'A few details first',
  description: 'These go straight into your document, so they are worth getting right.',
  submitLabel: 'Draft my document',
  busy: false,
})

const emit = defineEmits<{
  submit: [data: Record<string, string>]
  cancel: []
  /** Fired on every change so the answers outlive this component. */
  'update:draft': [values: Record<string, string>]
}>()

const OTHER_OPTION = 'Other'

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

const values = ref<Record<string, string>>({})
/** Multi-select answers, kept as arrays until they are serialized. */
const checked = ref<Record<string, string[]>>({})
/**
 * What the user typed for a choice they answered with "Other". Kept apart from
 * `values` so switching back to a listed option does not carry the free text
 * along, and switching back to "Other" does not lose it.
 */
const otherText = ref<Record<string, string>>({})
const touched = ref<Set<string>>(new Set())
const index = ref(0)
const reviewing = ref(false)

function isChoice(field: IntakeField) {
  return field.type === 'radio' || field.type === 'select'
}

function hasOther(field: IntakeField) {
  return isChoice(field) && (field.options ?? []).includes(OTHER_OPTION)
}

function needsOtherText(field: IntakeField) {
  return hasOther(field) && values.value[field.key] === OTHER_OPTION
}

const visible = computed<IntakeField[]>(() =>
  props.fields.filter((field) => {
    const rule = field.conditional
    if (!rule) return true

    // A field whose gating field is not part of this form is always shown;
    // only a field gated by a question the form actually asks is deferred.
    if (!props.fields.some((candidate) => candidate.key === rule.field)) return true

    return rule.values.includes(values.value[rule.field] ?? '')
  }),
)

const current = computed<IntakeField | null>(() => visible.value[index.value] ?? null)
const isLast = computed(() => index.value >= visible.value.length - 1)

const progress = computed(() => {
  const total = visible.value.length
  if (total === 0) return 0

  return Math.round(((reviewing.value ? total : index.value) / total) * 100)
})

/** Restore everything known about this form: prior submissions, then the draft. */
function hydrate() {
  values.value = {}
  checked.value = {}
  otherText.value = {}
  touched.value = new Set()
  index.value = 0
  reviewing.value = false

  for (const field of props.fields) {
    // The in-progress draft wins over a previous submission: it is the more
    // recent statement of what the user wants this document to say.
    const value = props.draft?.[field.key] ?? props.initialValues?.[field.key]
    if (value === undefined || value === '') continue

    if (field.type === 'checkbox') {
      checked.value[field.key] = value.split(',').map((option) => option.trim()).filter(Boolean)
    } else if (isChoice(field) && !(field.options ?? []).includes(value)) {
      // An answer that is not one of the offered options was typed freehand,
      // so it is restored the way it was given: "Other", selected, with the
      // text beside it.
      if (hasOther(field)) {
        values.value[field.key] = OTHER_OPTION
        otherText.value[field.key] = value
      }
    } else {
      values.value[field.key] = value
    }
  }
}

watch(() => props.fields, hydrate, { immediate: true })

/** The answers as the model receives them. */
function serialize(): Record<string, string> {
  const data: Record<string, string> = {}

  for (const field of visible.value) {
    if (field.type === 'checkbox') {
      const picked = checked.value[field.key] ?? []
      if (picked.length > 0) data[field.key] = picked.join(', ')
    } else if (needsOtherText(field)) {
      // The model receives what the user actually described, never the literal
      // word "Other", which would tell it nothing.
      const text = (otherText.value[field.key] ?? '').trim()
      if (text !== '') data[field.key] = text
    } else {
      const value = (values.value[field.key] ?? '').trim()
      if (value !== '') data[field.key] = value
    }
  }

  return data
}

// Handed up on every change, so the answers belong to the turn rather than to
// this component's lifetime.
watch([values, checked, otherText], () => emit('update:draft', serialize()), { deep: true })

watch(visible, (fields) => {
  // A conditional answer can hide a field; its value must not submit for a
  // transaction it no longer applies to.
  const keys = new Set(fields.map((field) => field.key))

  for (const store of [values, otherText]) {
    for (const key of Object.keys(store.value)) {
      if (!keys.has(key)) delete store.value[key]
    }
  }

  for (const key of Object.keys(checked.value)) {
    if (!keys.has(key)) delete checked.value[key]
  }

  index.value = Math.min(index.value, Math.max(fields.length - 1, 0))
})

function errorFor(field: IntakeField): string {
  if (!field.required) return ''

  if (field.type === 'checkbox') {
    return (checked.value[field.key] ?? []).length === 0 ? 'Pick at least one' : ''
  }

  if (needsOtherText(field)) {
    return (otherText.value[field.key] ?? '').trim() === '' ? 'Tell me what it should say' : ''
  }

  return (values.value[field.key] ?? '').trim() === '' ? 'This one is needed for the document' : ''
}

/** The error to show now — only after the reader has had a go at the field. */
const currentError = computed(() => {
  const field = current.value

  return field && touched.value.has(field.key) ? errorFor(field) : ''
})

const unanswered = computed(() => visible.value.filter((field) => errorFor(field) !== ''))

function toggleChecked(key: string, option: string) {
  const picked = checked.value[key] ?? []

  checked.value[key] = picked.includes(option)
    ? picked.filter((value) => value !== option)
    : [...picked, option]
}

function markTouched() {
  const field = current.value
  if (field) touched.value = new Set(touched.value).add(field.key)
}

function back() {
  if (reviewing.value) {
    reviewing.value = false
    index.value = Math.max(visible.value.length - 1, 0)

    return
  }

  index.value = Math.max(index.value - 1, 0)
}

function forward() {
  const field = current.value
  if (!field) return

  markTouched()
  if (errorFor(field) !== '') return

  if (isLast.value) reviewing.value = true
  else index.value += 1
}

/** Jump straight to a field from the review list. */
function edit(field: IntakeField) {
  const position = visible.value.findIndex((candidate) => candidate.key === field.key)
  if (position === -1) return

  reviewing.value = false
  index.value = position
}

function submit() {
  if (unanswered.value.length > 0) {
    // Land on the first thing still missing rather than describing it.
    const first = unanswered.value[0]!
    touched.value = new Set(visible.value.map((field) => field.key))
    edit(first)

    return
  }

  emit('submit', serialize())
}

/**
 * Enter advances, except in a textarea where it is a line break. Shift+Enter
 * submits from anywhere, which is the shortcut a reader who has filled a dozen
 * of these will reach for.
 */
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || props.busy) return

  const inTextarea = (event.target as HTMLElement | null)?.tagName === 'TEXTAREA'

  if (inTextarea && !event.shiftKey) return

  event.preventDefault()

  if (reviewing.value) submit()
  else forward()
}

/** What the review list shows for a field, or null when it was left empty. */
function answerFor(field: IntakeField): string | null {
  const data = serialize()

  return data[field.key] ?? null
}

const currentInput = useTemplateRef<HTMLElement>('currentInput')

watch([index, reviewing], async () => {
  await nextTick()
  // Focus follows the step, so the form is answerable from the keyboard alone.
  currentInput.value?.querySelector<HTMLElement>('input, textarea, [role="combobox"], button')?.focus()
})
</script>

<template>
  <section
    class="batayan-turn-in w-full overflow-hidden rounded-2xl border bg-card shadow-sm"
    @keydown="onKeydown"
  >
    <header class="border-b px-4 py-3">
      <div class="flex items-center gap-2.5">
        <span class="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <ClipboardListIcon class="size-4" />
        </span>
        <div class="min-w-0 flex-1">
          <h3 class="truncate text-sm font-semibold">{{ title }}</h3>
          <p class="mt-0.5 truncate text-xs text-muted-foreground">{{ description }}</p>
        </div>
        <span class="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
          {{ reviewing ? 'Review' : `${index + 1} / ${visible.length}` }}
        </span>
      </div>

      <div class="mt-2.5 h-1 overflow-hidden rounded-full bg-muted">
        <div
          class="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
          :style="{ width: `${progress}%` }"
        />
      </div>
    </header>

    <!-- Review: every answer at once, each one a click from being changed. -->
    <div v-if="reviewing" class="px-4 py-3.5">
      <p class="text-xs text-muted-foreground">
        Check these before I draft. Anything wrong here ends up in the document.
      </p>
      <ul class="mt-2.5 divide-y rounded-xl border">
        <li v-for="field in visible" :key="field.key">
          <button
            type="button"
            class="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            @click="edit(field)"
          >
            <span class="min-w-0 flex-1">
              <span class="block text-[10px] uppercase tracking-wide text-muted-foreground/75">
                {{ humanize(field.label) }}
              </span>
              <span
                class="mt-0.5 block break-words text-[13px] leading-relaxed"
                :class="answerFor(field) ? '' : 'italic text-muted-foreground/60'"
              >
                {{ answerFor(field) ?? (field.required ? 'Still needed' : 'Not given') }}
              </span>
            </span>
            <AlertCircleIcon
              v-if="errorFor(field)"
              class="mt-0.5 size-3.5 shrink-0 text-destructive"
            />
            <PencilLineIcon v-else class="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50" />
          </button>
        </li>
      </ul>
    </div>

    <!-- One question at a time. -->
    <Transition v-else name="step" mode="out-in">
      <div v-if="current" :key="current.key" ref="currentInput" class="space-y-2.5 px-4 py-3.5">
        <Label :for="current.key" class="text-sm font-medium">
          {{ humanize(current.label) }}
          <span v-if="!current.required" class="ml-1 text-xs font-normal text-muted-foreground">optional</span>
        </Label>

        <Textarea
          v-if="current.type === 'textarea'"
          :id="current.key"
          v-model="values[current.key]"
          rows="4"
          class="resize-none text-sm"
          @blur="markTouched"
        />

        <Select
          v-else-if="current.type === 'select'"
          v-model="values[current.key]"
          @update:model-value="markTouched"
        >
          <SelectTrigger class="w-full text-sm">
            <SelectValue :placeholder="`Choose ${humanize(current.label).toLowerCase()}`" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="option in current.options" :key="option" :value="option">
              {{ option }}
            </SelectItem>
          </SelectContent>
        </Select>

        <div v-else-if="current.type === 'radio' || current.type === 'checkbox'" class="space-y-1.5">
          <button
            v-for="option in current.options ?? []"
            :key="option"
            type="button"
            :aria-pressed="
              current.type === 'checkbox'
                ? (checked[current.key] ?? []).includes(option)
                : values[current.key] === option
            "
            class="flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :class="
              (current.type === 'checkbox'
                ? (checked[current.key] ?? []).includes(option)
                : values[current.key] === option)
                ? 'border-primary bg-primary/[0.07]'
                : 'border-border'
            "
            @click="
              current.type === 'checkbox'
                ? toggleChecked(current.key, option)
                : (values[current.key] = option);
              markTouched()
            "
          >
            <span
              class="flex size-4 shrink-0 items-center justify-center border transition-colors"
              :class="[
                current.type === 'checkbox' ? 'rounded' : 'rounded-full',
                (current.type === 'checkbox'
                  ? (checked[current.key] ?? []).includes(option)
                  : values[current.key] === option)
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input',
              ]"
            >
              <CheckIcon
                v-if="
                  current.type === 'checkbox'
                    ? (checked[current.key] ?? []).includes(option)
                    : values[current.key] === option
                "
                class="size-2.5"
              />
            </span>
            <span class="min-w-0">{{ option }}</span>
          </button>
        </div>

        <Input
          v-else
          :id="current.key"
          v-model="values[current.key]"
          :type="current.type"
          class="text-sm"
          @blur="markTouched"
        />

        <Input
          v-if="needsOtherText(current)"
          v-model="otherText[current.key]"
          type="text"
          class="text-sm"
          placeholder="Describe your answer"
          @blur="markTouched"
        />

        <p v-if="currentError" class="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircleIcon class="size-3.5 shrink-0" />
          {{ currentError }}
        </p>
      </div>
    </Transition>

    <footer class="flex items-center gap-2 border-t px-4 py-3">
      <Button
        variant="ghost"
        size="sm"
        class="h-8 px-2.5 text-xs text-muted-foreground"
        :disabled="busy"
        @click="emit('cancel')"
      >
        Close
      </Button>

      <span class="flex-1" />

      <Button
        v-if="index > 0 || reviewing"
        variant="outline"
        size="sm"
        class="h-8 gap-1.5 px-3 text-xs"
        :disabled="busy"
        @click="back"
      >
        <ArrowLeftIcon class="size-3.5" />
        Back
      </Button>

      <Button
        v-if="!reviewing"
        size="sm"
        class="h-8 gap-1.5 px-4 text-xs"
        :disabled="busy"
        @click="forward"
      >
        {{ isLast ? 'Review' : 'Next' }}
        <ArrowRightIcon class="size-3.5" />
      </Button>

      <Button v-else size="sm" class="h-8 gap-1.5 px-4 text-xs" :disabled="busy" @click="submit">
        <CheckIcon v-if="!busy" class="size-3.5" />
        {{ busy ? 'Working…' : submitLabel }}
      </Button>
    </footer>
  </section>
</template>

<style scoped>
.step-enter-active,
.step-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.step-enter-from {
  opacity: 0;
  transform: translateX(8px);
}

.step-leave-to {
  opacity: 0;
  transform: translateX(-8px);
}

@media (prefers-reduced-motion: reduce) {
  .step-enter-active,
  .step-leave-active {
    transition: none;
  }
}
</style>
