<script setup lang="ts">
import { CheckIcon, ChevronDownIcon } from '@lucide/vue'
import type { HTMLAttributes } from 'vue'

export interface SearchableSelectOption {
  value: string
  label: string
}

const props = withDefaults(defineProps<{
  modelValue?: string
  options: SearchableSelectOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyLabel?: string
  ariaLabel?: string
  ariaDescribedby?: string
  id?: string
  class?: HTMLAttributes['class']
  disabled?: boolean
  invalid?: boolean
}>(), {
  modelValue: '',
  placeholder: 'Select an option…',
  searchPlaceholder: 'Search options…',
  emptyLabel: 'No matching options.',
  ariaLabel: undefined,
  ariaDescribedby: undefined,
  id: undefined,
  class: undefined,
  disabled: false,
  invalid: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const open = ref(false)
const selected = computed(() => props.options.find(option => option.value === props.modelValue))
const listId = computed(() => props.id ? `${props.id}-options` : undefined)

function displayValue(value: unknown) {
  if (!value || typeof value !== 'object' || !('label' in value)) return ''
  return String((value as SearchableSelectOption).label)
}

function updateValue(value: unknown) {
  if (!value || typeof value !== 'object' || !('value' in value)) {
    emit('update:modelValue', '')
    return
  }
  emit('update:modelValue', String((value as SearchableSelectOption).value))
}
</script>

<template>
  <Combobox
    :model-value="selected"
    by="value"
    :disabled="disabled"
    :open="open"
    @update:model-value="updateValue"
    @update:open="open = $event"
  >
    <ComboboxAnchor as-child>
      <ComboboxTrigger as-child>
        <Button
          :id="id"
          type="button"
          variant="outline"
          role="combobox"
          :aria-label="ariaLabel"
          :aria-describedby="ariaDescribedby"
          :aria-expanded="open"
          :aria-controls="listId"
          :aria-invalid="invalid || undefined"
          :disabled="disabled"
          :class="['h-11 w-full justify-between text-left font-normal', props.class]"
        >
          <span class="truncate">{{ selected?.label ?? placeholder }}</span>
          <ChevronDownIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </ComboboxTrigger>
    </ComboboxAnchor>
    <ComboboxList :id="listId" class="w-(--reka-combobox-trigger-width) p-0">
      <ComboboxInput :placeholder="searchPlaceholder" :display-value="displayValue" />
      <ComboboxViewport>
        <ComboboxEmpty>{{ emptyLabel }}</ComboboxEmpty>
        <ComboboxGroup>
          <ComboboxItem
            v-for="option in options"
            :key="option.value"
            :value="option"
            :text-value="option.label"
          >
            <span class="truncate">{{ option.label }}</span>
            <ComboboxItemIndicator>
              <CheckIcon class="size-4" aria-hidden="true" />
            </ComboboxItemIndicator>
          </ComboboxItem>
        </ComboboxGroup>
      </ComboboxViewport>
    </ComboboxList>
  </Combobox>
</template>
