<script setup lang="ts">
import { EyeIcon, EyeOffIcon } from '@lucide/vue'

const props = withDefaults(defineProps<{
  modelValue: string
  id: string
  autocomplete?: string
  placeholder?: string
  /** Message shown by the parent; used here only to mark the input invalid. */
  error?: string
  required?: boolean
}>(), {
  autocomplete: 'current-password',
  placeholder: '••••••••',
  error: '',
  required: true,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const visible = ref(false)
const capsLock = ref(false)

const value = computed({
  get: () => props.modelValue,
  set: (next: string) => emit('update:modelValue', next),
})

// Caps Lock is the most common cause of a rejected password that the user
// typed correctly, and it is invisible while the field is masked.
function syncCapsLock(event: KeyboardEvent) {
  capsLock.value = event.getModifierState?.('CapsLock') ?? false
}
</script>

<template>
  <div>
    <div class="relative">
      <Input
        :id="id"
        v-model="value"
        :type="visible ? 'text' : 'password'"
        :autocomplete="autocomplete"
        :placeholder="placeholder"
        :required="required"
        :aria-invalid="error !== '' ? true : undefined"
        :aria-describedby="error !== '' ? `${id}-error` : undefined"
        class="h-10 pr-10"
        @keyup="syncCapsLock"
        @keydown="syncCapsLock"
        @blur="capsLock = false"
      />
      <button
        type="button"
        class="absolute right-1 top-1 flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        :aria-label="visible ? 'Hide password' : 'Show password'"
        :aria-pressed="visible"
        @click="visible = !visible"
      >
        <component :is="visible ? EyeOffIcon : EyeIcon" class="size-4" />
      </button>
    </div>

    <p v-if="capsLock" class="mt-1.5 text-xs text-muted-foreground">
      Caps Lock is on.
    </p>
  </div>
</template>
