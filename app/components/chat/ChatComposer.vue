<script setup lang="ts">
import { Loader2Icon, SendIcon, SquareIcon } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    disabled?: boolean
    streaming?: boolean
    placeholder?: string
    canSend?: boolean
  }>(),
  {
    disabled: false,
    streaming: false,
    canSend: true,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  send: []
  stop: []
}>()

const textareaEl = ref<HTMLTextAreaElement | null>(null)

function onInput(event: Event) {
  const el = textareaEl.value
  if (el) {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    submit()
  }
}

function submit() {
  if (props.modelValue.trim() && !props.disabled && props.canSend !== false) {
    emit('send')
  }
}

const sendDisabled = computed(() => !props.modelValue.trim() || props.disabled || props.canSend === false)

const textareaClass = 'min-h-10 max-h-40 min-w-0 flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50'
</script>

<template>
  <div class="mx-auto w-full max-w-3xl">
    <div
      class="flex items-end gap-2 rounded-2xl border bg-card/70 p-2 shadow-sm backdrop-blur transition-shadow focus-within:shadow-md focus-within:ring-2 focus-within:ring-primary/30"
    >
      <textarea
        ref="textareaEl"
        :value="modelValue"
        :class="textareaClass"
        :placeholder="placeholder ?? 'Ask anything…'"
        :disabled="disabled"
        rows="1"
        aria-label="Message"
        @input="onInput"
        @keydown="onKeydown"
      />

      <Button
        v-if="streaming"
        type="button"
        size="icon"
        class="h-10 w-10 shrink-0 rounded-xl"
        title="Stop generating"
        @click="emit('stop')"
      >
        <SquareIcon class="size-4" />
        <span class="sr-only">Stop generating</span>
      </Button>
      <Button
        v-else
        type="button"
        size="icon"
        class="h-10 w-10 shrink-0 rounded-xl"
        :disabled="sendDisabled"
        :title="sendDisabled ? 'Type a message' : 'Send'"
        @click="submit"
      >
        <Loader2Icon v-if="disabled" class="size-4 animate-spin" />
        <SendIcon v-else class="size-4" />
        <span class="sr-only">Send</span>
      </Button>
    </div>
    <p class="mt-1.5 px-1 text-center text-[11px] text-muted-foreground/80">
      Batayan AI can make mistakes — verify important legal details before acting on them.
    </p>
  </div>
</template>
