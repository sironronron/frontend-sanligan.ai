<script lang="ts">
import type { Component } from 'vue'

// `<script setup>` cannot carry exports, so the shared shape lives in a plain
// script block alongside it.
export interface OnboardingChoice {
  value: string
  label: string
  /** Optional second line, for options whose label alone is ambiguous. */
  hint?: string
  icon?: Component
}
</script>

<script setup lang="ts">
import { CheckIcon } from '@lucide/vue'

const props = defineProps<{
  /** The selected value, or the selected values when `multiple` is set. */
  modelValue: string | string[] | null
  options: OnboardingChoice[]
  /** Radio group name. Must be unique among the groups rendered at once. */
  name: string
  /** Renders checkboxes and emits an array instead of a single value. */
  multiple?: boolean
  /** With `multiple`, the most that can be selected at once. */
  max?: number
  /** Two columns from `sm` up, for short labels that would otherwise strand whitespace. */
  dense?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [string | string[]] }>()

function isSelected(value: string) {
  return props.multiple
    ? Array.isArray(props.modelValue) && props.modelValue.includes(value)
    : props.modelValue === value
}

/**
 * At the cap, the options not already chosen are disabled rather than hidden —
 * the user can still see what they passed over, and clearing one re-opens the
 * rest without the list reflowing under the pointer.
 */
function isDisabled(value: string) {
  if (!props.multiple || props.max === undefined) return false

  const current = Array.isArray(props.modelValue) ? props.modelValue : []

  return current.length >= props.max && !current.includes(value)
}

function choose(value: string) {
  if (!props.multiple) {
    emit('update:modelValue', value)
    return
  }

  const current = Array.isArray(props.modelValue) ? props.modelValue : []

  if (current.includes(value)) {
    emit('update:modelValue', current.filter(v => v !== value))
    return
  }

  if (isDisabled(value)) return

  emit('update:modelValue', [...current, value])
}
</script>

<template>
  <!--
    Real inputs, visually hidden inside their labels. Arrow-key navigation
    within the group, focus order, and the radio/checkbox announcement all come
    from the browser rather than being re-implemented on <button> elements.
  -->
  <div class="grid gap-2" :class="dense ? 'sm:grid-cols-2' : undefined">
    <label
      v-for="option in options"
      :key="option.value"
      class="group relative flex items-center gap-3 rounded-xl border bg-card/40 px-3.5 py-3 transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background"
      :class="[
        isDisabled(option.value)
          ? 'cursor-not-allowed border-border opacity-45'
          : 'cursor-pointer hover:border-primary/40 hover:bg-primary/[0.04]',
        isSelected(option.value)
          ? 'border-primary bg-primary/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
          : 'border-border',
      ]"
    >
      <input
        class="sr-only"
        :type="multiple ? 'checkbox' : 'radio'"
        :name="name"
        :value="option.value"
        :checked="isSelected(option.value)"
        :disabled="isDisabled(option.value)"
        @change="choose(option.value)"
      >

      <span
        v-if="option.icon"
        aria-hidden="true"
        class="flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-150"
        :class="isSelected(option.value)
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground group-hover:text-foreground'"
      >
        <component :is="option.icon" class="size-4.5" />
      </span>

      <span class="min-w-0 flex-1">
        <span class="block text-sm font-medium leading-snug">{{ option.label }}</span>
        <span v-if="option.hint" class="mt-0.5 block text-xs leading-snug text-muted-foreground">
          {{ option.hint }}
        </span>
      </span>

      <span
        aria-hidden="true"
        class="flex size-5 shrink-0 items-center justify-center border-2 transition-colors duration-150"
        :class="[
          multiple ? 'rounded-[0.3rem]' : 'rounded-full',
          isSelected(option.value)
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-muted-foreground/25 group-hover:border-primary/40',
        ]"
      >
        <CheckIcon v-if="isSelected(option.value)" class="size-3" :stroke-width="3" />
      </span>
    </label>
  </div>
</template>
