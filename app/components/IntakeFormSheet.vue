<script setup lang="ts">
import { ClipboardListIcon, XIcon } from '@lucide/vue'

export interface IntakeField {
  key: string
  label: string
  type: 'text' | 'date' | 'number' | 'select' | 'textarea' | 'radio' | 'checkbox'
  options?: string[]
  required: boolean
}

const props = defineProps<{
  fields: IntakeField[]
}>()

const emit = defineEmits<{
  submit: [data: Record<string, string>]
  cancel: []
}>()

const formData = ref<Record<string, string>>({})
const checkboxValues = ref<Record<string, string[]>>({})
const validationError = ref('')

watch(
  () => props.fields,
  () => {
    formData.value = {}
    checkboxValues.value = {}
    validationError.value = ''
  },
  { immediate: true },
)

function toggleCheckbox(key: string, option: string) {
  const current = checkboxValues.value[key] ?? []
  checkboxValues.value[key] = current.includes(option)
    ? current.filter((value) => value !== option)
    : [...current, option]
}

function missingRequiredCheckboxes(): string[] {
  return props.fields
    .filter((field) => field.required && field.type === 'checkbox' && (checkboxValues.value[field.key] ?? []).length === 0)
    .map((field) => field.label)
}

function serialize(): Record<string, string> {
  const data: Record<string, string> = { ...formData.value }

  for (const field of props.fields) {
    if (field.type === 'checkbox') {
      data[field.key] = (checkboxValues.value[field.key] ?? []).join(', ')
    }
  }

  return data
}

function handleSubmit() {
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
      <div class="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-2xl border-t bg-background shadow-2xl lg:inset-x-auto lg:right-0 lg:top-14 lg:bottom-0 lg:max-h-none lg:w-[400px] lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-xl lg:bg-background">
        <div class="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/25 lg:hidden" />
        <div class="flex items-center justify-between border-b px-4 py-3">
          <div class="flex items-center gap-2">
            <ClipboardListIcon class="size-4 text-primary" />
            <h3 class="text-sm font-semibold">Information Needed</h3>
          </div>
          <Button variant="ghost" size="icon" class="size-7" @click="emit('cancel')">
            <XIcon class="size-4" />
          </Button>
        </div>

        <form class="flex-1 overflow-y-auto px-4 pb-2 pt-3 space-y-4" @submit.prevent="handleSubmit">
          <p class="text-xs text-muted-foreground">
            Please provide the following information so I can draft your document accurately.
          </p>

          <div v-for="field in fields" :key="field.key" class="space-y-1.5">
            <Label :for="field.key" class="text-xs">
              {{ field.label }}
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
                  <SelectValue :placeholder="`Select ${field.label}`" />
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
          </div>

          <p v-if="validationError" class="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {{ validationError }}
          </p>

          <div class="sticky bottom-0 -mx-4 mt-1 flex gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur">
            <Button type="button" variant="outline" class="flex-1" @click="emit('cancel')">
              Cancel
            </Button>
            <Button type="submit" class="flex-1">
              Submit
            </Button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
