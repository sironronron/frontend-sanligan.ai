<script setup lang="ts">
import { ClipboardListIcon, XIcon } from '@lucide/vue'

export interface IntakeField {
  key: string
  label: string
  type: 'text' | 'date' | 'number' | 'select' | 'textarea' | 'radio' | 'checkbox'
  options?: string[]
  required: boolean
  section?: string
  conditional?: { field: string; values: string[] }
}

interface FieldGroup {
  section: string | null
  fields: IntakeField[]
}

const props = withDefaults(defineProps<{
  fields: IntakeField[]
  initialValues?: Record<string, string>
  title?: string
  description?: string
  submitLabel?: string
  busy?: boolean
}>(), {
  initialValues: () => ({}),
  title: 'Information Needed',
  description: 'Please provide the following information so I can draft your document accurately.',
  submitLabel: 'Submit',
  busy: false,
})

const emit = defineEmits<{
  submit: [data: Record<string, string>]
  cancel: []
}>()

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

const formData = ref<Record<string, string>>({})
const checkboxValues = ref<Record<string, string[]>>({})
// What the user typed for a choice field they answered with "Other". Kept
// apart from formData so switching back to a listed option does not carry the
// free text along, and switching back to "Other" does not lose it.
const otherValues = ref<Record<string, string>>({})
const validationError = ref('')

const OTHER_OPTION = 'Other'

function isChoice(field: IntakeField) {
  return field.type === 'radio' || field.type === 'select'
}

/**
 * A choice field offers "Other" when the AI could not enumerate every answer.
 * Picking it reveals a text box, so the user is never forced into an option
 * that does not describe their situation.
 */
function hasOther(field: IntakeField) {
  return isChoice(field) && (field.options ?? []).includes(OTHER_OPTION)
}

function needsOtherText(field: IntakeField) {
  return hasOther(field) && formData.value[field.key] === OTHER_OPTION
}

const visibleFields = computed<IntakeField[]>(() =>
  props.fields.filter((field) => {
    const rule = field.conditional
    if (!rule) return true
    // A field whose gating field is not part of the form is always visible;
    // only a transaction-relevant field in a form that asks for the
    // transaction type is hidden until the type is selected.
    const gating = props.fields.some((candidate) => candidate.key === rule.field)
    if (!gating) return true
    return rule.values.includes(formData.value[rule.field] ?? '')
  }),
)

const fieldGroups = computed<FieldGroup[]>(() => {
  const groups: FieldGroup[] = []

  for (const field of visibleFields.value) {
    const section = field.section ?? null
    const last = groups[groups.length - 1]

    if (last && last.section === section) {
      last.fields.push(field)
    } else {
      groups.push({ section, fields: [field] })
    }
  }

  return groups
})

watch(
  () => props.fields,
  () => {
    formData.value = {}
    checkboxValues.value = {}
    otherValues.value = {}
    validationError.value = ''

    // Carry over the user's previously submitted answers (e.g. when they
    // regenerate the same document) so the form comes pre-filled instead of
    // forcing them to re-enter everything.
    for (const field of props.fields) {
      const value = props.initialValues?.[field.key]
      if (value === undefined || value === '') continue
      if (field.type === 'checkbox') {
        checkboxValues.value[field.key] = value
          .split(',')
          .map((option) => option.trim())
          .filter(Boolean)
      } else if (isChoice(field) && !(field.options ?? []).includes(value)) {
        // A previous answer that is not one of the offered options was typed
        // freehand, so it is restored the way it was given: "Other", selected,
        // with the text alongside it.
        if (hasOther(field)) {
          formData.value[field.key] = OTHER_OPTION
          otherValues.value[field.key] = value
        }
      } else {
        formData.value[field.key] = value
      }
    }
  },
  { immediate: true },
)

watch(visibleFields, (fields) => {
  // Drop values for fields that have become hidden by the transaction type so
  // they never submit stale answers for a transaction they no longer apply to.
  const visibleKeys = new Set(fields.map((field) => field.key))

  for (const key of Object.keys(formData.value)) {
    if (!visibleKeys.has(key)) delete formData.value[key]
  }

  for (const key of Object.keys(checkboxValues.value)) {
    if (!visibleKeys.has(key)) delete checkboxValues.value[key]
  }

  for (const key of Object.keys(otherValues.value)) {
    if (!visibleKeys.has(key)) delete otherValues.value[key]
  }
})

function toggleCheckbox(key: string, option: string) {
  const current = checkboxValues.value[key] ?? []
  checkboxValues.value[key] = current.includes(option)
    ? current.filter((value) => value !== option)
    : [...current, option]
}

function missingRequiredCheckboxes(): string[] {
  return visibleFields.value
    .filter((field) => field.required && field.type === 'checkbox' && (checkboxValues.value[field.key] ?? []).length === 0)
    .map((field) => humanize(field.label))
}

function missingOtherText(): string[] {
  return visibleFields.value
    .filter((field) => field.required && needsOtherText(field) && (otherValues.value[field.key] ?? '').trim() === '')
    .map((field) => humanize(field.label))
}

function serialize(): Record<string, string> {
  const data: Record<string, string> = { ...formData.value }

  for (const field of visibleFields.value) {
    if (field.type === 'checkbox') {
      data[field.key] = (checkboxValues.value[field.key] ?? []).join(', ')
    } else if (needsOtherText(field)) {
      // The AI receives what the user actually described, not the literal
      // word "Other", which would tell it nothing.
      data[field.key] = (otherValues.value[field.key] ?? '').trim()
    }
  }

  return data
}

function handleSubmit() {
  const unspecified = missingOtherText()

  if (unspecified.length > 0) {
    validationError.value = `Please describe your answer for: ${unspecified.join(', ')}`
    return
  }

  const missing = missingRequiredCheckboxes()

  if (missing.length > 0) {
    validationError.value = `Please select at least one option for: ${missing.join(', ')}`
    return
  }

  validationError.value = ''
  emit('submit', serialize())
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-[2px]" @click="emit('cancel')" />
      <div class="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-2xl border-t bg-card shadow-2xl lg:inset-x-auto lg:right-0 lg:top-14 lg:bottom-0 lg:max-h-none lg:w-[400px] lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-xl lg:bg-card">
        <div class="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/25 lg:hidden" />
        <div class="flex items-center justify-between border-b px-4 py-3">
          <div class="flex items-center gap-2">
            <ClipboardListIcon class="size-4 text-primary" />
            <h3 class="text-sm font-semibold">{{ props.title }}</h3>
          </div>
          <Button variant="ghost" size="icon" class="size-7" @click="emit('cancel')">
            <XIcon class="size-4" />
          </Button>
        </div>

        <form class="flex-1 overflow-y-auto px-4 pb-2 pt-3 space-y-4" @submit.prevent="handleSubmit">
          <p class="text-xs text-muted-foreground">
            {{ props.description }}
          </p>

          <div v-for="group in fieldGroups" :key="group.section ?? ''" class="space-y-4">
            <p v-if="group.section" class="pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {{ humanize(group.section) }}
            </p>

            <div v-for="field in group.fields" :key="field.key" class="space-y-1.5">
              <Label :for="field.key" class="text-xs">
                {{ humanize(field.label) }}
                <span v-if="field.required" class="text-destructive">*</span>
              </Label>

              <template v-if="field.type === 'textarea'">
                <Textarea
                  :id="field.key"
                  v-model="formData[field.key]"
                  rows="3"
                  class="resize-none text-sm"
                  :required="field.required"
                />
              </template>

              <template v-else-if="field.type === 'select'">
                <Select v-model="formData[field.key]">
                  <SelectTrigger class="w-full text-sm">
                    <SelectValue :placeholder="`Select ${humanize(field.label)}`" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="option in field.options" :key="option" :value="option">
                      {{ option }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </template>

              <template v-else-if="field.type === 'radio'">
                <div class="space-y-2">
                  <label
                    v-for="option in field.options ?? []"
                    :key="option"
                    class="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  >
                    <input
                      v-model="formData[field.key]"
                      type="radio"
                      :name="field.key"
                      :value="option"
                      :required="field.required"
                      class="size-4 shrink-0 rounded-full border-input text-primary focus-visible:ring-ring/50 focus-visible:ring-3 focus:outline-none"
                    />
                    <span>{{ option }}</span>
                  </label>
                </div>
              </template>

              <template v-else-if="field.type === 'checkbox'">
                <div class="space-y-2">
                  <label
                    v-for="option in field.options ?? []"
                    :key="option"
                    class="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  >
                    <input
                      type="checkbox"
                      :value="option"
                      :checked="(checkboxValues[field.key] ?? []).includes(option)"
                      class="size-4 shrink-0 rounded border-input text-primary focus-visible:ring-ring/50 focus-visible:ring-3 focus:outline-none"
                      @change="toggleCheckbox(field.key, option)"
                    />
                    <span>{{ option }}</span>
                  </label>
                  <p v-if="field.required" class="text-[11px] text-muted-foreground">
                    Select at least one option
                  </p>
                </div>
              </template>

              <template v-else>
                <Input
                  :id="field.key"
                  v-model="formData[field.key]"
                  :type="field.type"
                  class="text-sm"
                  :required="field.required"
                />
              </template>

              <Input
                v-if="needsOtherText(field)"
                v-model="otherValues[field.key]"
                type="text"
                class="text-sm"
                placeholder="Describe your answer"
              />
            </div>
          </div>

          <p v-if="validationError" class="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {{ validationError }}
          </p>

          <div class="sticky bottom-0 -mx-4 mt-1 flex gap-2 border-t bg-card/95 px-4 py-3 backdrop-blur">
            <Button type="button" variant="outline" class="flex-1" @click="emit('cancel')">
              Cancel
            </Button>
            <Button type="submit" class="flex-1" :loading="props.busy">
              {{ props.busy ? 'Working…' : props.submitLabel }}
            </Button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
