<script setup lang="ts">
import { Loader2Icon, PaperclipIcon, SendIcon, SquareIcon, XIcon, AlertCircleIcon } from '@lucide/vue'
import type { ChatAttachment } from '~/composables/useChatAttachments'
import ChatHelpGuide from '~/components/chat/ChatHelpGuide.vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    disabled?: boolean
    streaming?: boolean
    placeholder?: string
    canSend?: boolean
    attachments?: ChatAttachment[]
    /** Hides the attach button where uploading is not available. */
    canAttach?: boolean
    /** Tunes the inline help guide for general research or a case thread. */
    helpContext?: 'general' | 'case'
    /** Locks the composer (no typing, sending, or attaching) without a spinner. */
    readonly?: boolean
  }>(),
  {
    disabled: false,
    streaming: false,
    canSend: true,
    canAttach: true,
    helpContext: 'general',
    readonly: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  send: []
  stop: []
  attach: [files: File[]]
  'remove-attachment': [localId: string]
}>()

const { fileIcon } = useFileTypeIcon()

const textareaEl = ref<HTMLTextAreaElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const fileDrop = useFileDrop()

const attachments = computed(() => props.attachments ?? [])

/**
 * The composer grows with the message up to this height (~7 lines), then
 * scrolls instead of pushing the conversation off the screen.
 */
const MAX_HEIGHT = 160

function resize() {
  const el = textareaEl.value
  if (!el) return

  // Collapse first so scrollHeight reports the content height, not the
  // height the box already had — otherwise it can only ever grow.
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden'
}

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
}

/**
 * Resize from the value rather than the keystroke: suggestions, starters, and
 * templates fill the box from outside, and sending clears it — all of which
 * left the old input-only handler showing a stale height.
 */
watch(() => props.modelValue, () => nextTick(resize))

onMounted(resize)

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    submit()
  }
}

function submit() {
  if (props.modelValue.trim() && !props.disabled && !props.readonly && props.canSend !== false) {
    emit('send')
  }
}

function focus() {
  textareaEl.value?.focus()
  resize()
}

defineExpose({ focus })

function pickFiles() {
  fileInput.value?.click()
}

function onFilesSelected(event: Event) {
  const target = event.target as HTMLInputElement
  const picked = target.files ? Array.from(target.files) : []
  // Reset first so picking the same file twice still fires a change event.
  target.value = ''
  if (picked.length > 0) emit('attach', picked)
}

const dropError = ref('')

function onFilesDropped(event: DragEvent) {
  if (!props.canAttach) return

  const rejected = fileDrop.onDrop(event, (files) => {
    dropError.value = ''
    emit('attach', files)
  })

  dropError.value = rejected.length > 0
    ? `"${rejected[0]!.name}" is not a supported file type. Use PDF, DOCX, TXT, MD, or an image.`
    : ''
}

const sendDisabled = computed(() => !props.modelValue.trim() || props.disabled || props.readonly || props.canSend === false)

const attachmentPending = computed(() =>
  attachments.value.some((a) => a.status === 'uploading' || a.status === 'queued' || a.status === 'processing'),
)

const sendTitle = computed(() => {
  if (!props.modelValue.trim()) return 'Type a message'
  if (attachmentPending.value) return 'Waiting for your attachments to finish processing'
  return sendDisabled.value ? 'Type a message' : 'Send'
})

const statusLabels: Record<ChatAttachment['status'], string> = {
  uploading: 'Uploading…',
  queued: 'Queued',
  processing: 'Processing…',
  ready: 'Ready',
  failed: 'Failed',
}

function statusLabel(attachment: ChatAttachment): string {
  if (attachment.status === 'failed' && attachment.error) return attachment.error
  return statusLabels[attachment.status]
}

const textareaClass = 'min-h-10 min-w-0 flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50'
</script>

<template>
  <div class="w-full">
    <div
      class="rounded-2xl border bg-card/70 p-2 shadow-sm backdrop-blur transition-shadow focus-within:shadow-md focus-within:ring-2 focus-within:ring-primary/30"
      :class="fileDrop.dragging.value && canAttach ? 'border-primary ring-2 ring-primary/30' : ''"
      @dragenter="canAttach && fileDrop.onDragEnter($event)"
      @dragover="canAttach && fileDrop.onDragOver($event)"
      @dragleave="canAttach && fileDrop.onDragLeave($event)"
      @drop="onFilesDropped"
    >
      <ul v-if="attachments.length > 0" class="mb-1.5 flex flex-wrap gap-1.5 px-1">
        <li
          v-for="attachment in attachments"
          :key="attachment.localId"
          class="flex max-w-full items-center gap-1.5 rounded-lg border bg-card px-2 py-1 text-xs"
          :class="attachment.status === 'failed' ? 'border-destructive/40 text-destructive' : ''"
        >
          <Loader2Icon
            v-if="attachment.status === 'uploading' || attachment.status === 'queued' || attachment.status === 'processing'"
            class="size-3.5 shrink-0 animate-spin text-muted-foreground"
          />
          <AlertCircleIcon v-else-if="attachment.status === 'failed'" class="size-3.5 shrink-0" />
          <component :is="fileIcon(attachment.name)" v-else class="size-3.5 shrink-0 text-muted-foreground" />
          <span class="min-w-0 truncate font-medium">{{ attachment.name }}</span>
          <span class="shrink-0 text-muted-foreground">· {{ statusLabel(attachment) }}</span>
          <button
            type="button"
            class="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            :aria-label="`Remove ${attachment.name}`"
            @click="emit('remove-attachment', attachment.localId)"
          >
            <XIcon class="size-3" />
          </button>
        </li>
      </ul>

      <div class="flex items-center">
        <Button
          v-if="canAttach"
          type="button"
          variant="ghost"
          size="icon"
          class="h-10 w-10 shrink-0 rounded-xl text-muted-foreground hover:text-foreground"
          :disabled="disabled || readonly"
          title="Attach a document"
          @click="pickFiles"
        >
          <PaperclipIcon class="size-4" />
          <span class="sr-only">Attach a document</span>
        </Button>
        <input
          ref="fileInput"
          type="file"
          accept=".pdf,.docx,.txt,.md,.jpg,.jpeg,.png,.webp,.gif,.tiff,.heic"
          multiple
          class="hidden"
          @change="onFilesSelected"
        />

        <ChatHelpGuide :context="helpContext" />

        <textarea
          ref="textareaEl"
          :value="modelValue"
          :class="textareaClass"
          :style="{ maxHeight: `${MAX_HEIGHT}px` }"
          :placeholder="placeholder ?? 'Ask anything…'"
          :disabled="disabled || readonly"
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
          :title="sendTitle"
          @click="submit"
        >
          <Loader2Icon v-if="disabled" class="size-4 animate-spin" />
          <SendIcon v-else class="size-4" />
          <span class="sr-only">Send</span>
        </Button>
      </div>
    </div>

    <p v-if="dropError" class="mt-1.5 px-1 text-center text-[11px] text-destructive">
      {{ dropError }}
    </p>
    <p v-else-if="attachmentPending" class="mt-1.5 px-1 text-center text-[11px] text-muted-foreground">
      Preparing your attachment — you can send as soon as it is ready.
    </p>
    <p class="mt-1.5 px-1 text-center text-[11px] text-muted-foreground/80">
      Batayan AI can make mistakes — verify important legal details before acting on them.
    </p>
  </div>
</template>
