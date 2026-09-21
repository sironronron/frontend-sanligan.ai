<script setup lang="ts">
import { AlertCircleIcon, ArrowUpIcon, Loader2Icon, PaperclipIcon, SparklesIcon, SquareIcon, XIcon } from '@lucide/vue'
import type { ChatAttachment } from '~/composables/useChatAttachments'
import ChatHelpGuide from '~/components/chat/ChatHelpGuide.vue'
import { isPdfDocument } from '~/composables/useDocumentFile'

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
    /** The taller, roomier composer shown centered on an empty conversation. */
    large?: boolean
  }>(),
  {
    disabled: false,
    streaming: false,
    canSend: true,
    canAttach: true,
    helpContext: 'general',
    readonly: false,
    large: false,
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
const auth = useAuthStore()
const billing = useBillingStore()

const textareaEl = ref<HTMLTextAreaElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const fileDrop = useFileDrop()
const canUsePdf = computed(() => auth.user?.is_admin === true || billing.hasFeature('pdf_documents'))

const attachments = computed(() => props.attachments ?? [])

/**
 * The composer grows with the message up to this height (~7 lines, ~11 for
 * the large empty-state variant), then scrolls instead of pushing the
 * conversation off the screen.
 */
const MAX_HEIGHT = computed(() => (props.large ? 240 : 160))

function resize() {
  const el = textareaEl.value
  if (!el) return

  // Collapse first so scrollHeight reports the content height, not the
  // height the box already had — otherwise it can only ever grow.
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT.value)}px`
  el.style.overflowY = el.scrollHeight > MAX_HEIGHT.value ? 'auto' : 'hidden'
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
  const accepted = canUsePdf.value ? picked : picked.filter(file => !isPdfDocument(file.name, file.type))
  const blocked = picked.find(file => isPdfDocument(file.name, file.type))
  if (accepted.length > 0) {
    dropError.value = ''
    emit('attach', accepted)
  }
  if (blocked) {
    dropError.value = 'PDF attachments are available on paid plans. Choose a DOCX, TXT, MD, or image file instead.'
  }
}

const dropError = ref('')

function onFilesDropped(event: DragEvent) {
  if (!props.canAttach) return

  const rejected = fileDrop.onDrop(event, (files) => {
    const accepted = canUsePdf.value ? files : files.filter(file => !isPdfDocument(file.name, file.type))
    const blocked = files.find(file => isPdfDocument(file.name, file.type))
    dropError.value = ''
    if (accepted.length > 0) emit('attach', accepted)
    if (blocked) dropError.value = 'PDF attachments are available on paid plans. Choose a DOCX, TXT, MD, or image file instead.'
  })

  if (rejected.length > 0) {
    dropError.value = `"${rejected[0]!.name}" is not a supported file type. Use ${canUsePdf.value ? 'PDF, ' : ''}DOCX, TXT, MD, or an image.`
  }
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

const textareaClass = computed(() =>
  props.large
    ? 'min-h-14 min-w-0 flex-1 resize-none border-0 bg-transparent px-0 py-2 text-base outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed disabled:opacity-50'
    : 'min-h-9 min-w-0 flex-1 resize-none border-0 bg-transparent px-0 py-1.5 text-base outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm',
)

/** The left-cluster toolbar pills: attach, help — icon plus a short label. */
const pillClass = computed(() =>
  props.large
    ? 'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/80 px-3.5 py-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:border-foreground/20 hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50'
    : 'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/80 px-3 py-1.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:border-foreground/20 hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
)

/** Send/stop is a plain circle with just an arrow or a square — no label. */
const sendCircleClass = computed(() => (props.large ? 'size-11 rounded-full' : 'size-9 rounded-full'))
</script>

<template>
  <div class="w-full">
    <!--
      Two layers, each split into a base plus a shine: the base is a static
      conic gradient, so the full rainbow sits on every edge all the time
      instead of rotating in and out. A separate bright wedge, oversized and
      clipped the same way, spins continuously clockwise on top (blended with
      `screen`) so it reads as one glint chasing the border around an
      always-present rainbow, not the rainbow itself moving.
    -->
    <div class="relative">
      <div
        aria-hidden="true"
        class="pointer-events-none absolute -inset-1 overflow-hidden blur-sm sm:-inset-1.5"
        :class="large ? 'rounded-[34px]' : 'rounded-[30px]'"
      >
        <div class="composer-ray-glow absolute inset-0" />
        <div class="composer-ring-shine absolute inset-[-60%] motion-reduce:animate-none" />
      </div>
      <div
        class="relative overflow-hidden"
        :class="large ? 'rounded-[30px] p-[1.5px]' : 'rounded-[26px] p-[1.5px]'"
      >
        <div aria-hidden="true" class="composer-ring-glow absolute inset-0" />
        <div
          aria-hidden="true"
          class="composer-ring-shine absolute inset-[-60%] motion-reduce:animate-none"
        />
      <div
        class="relative border border-transparent bg-card shadow-lg backdrop-blur transition-shadow focus-within:shadow-xl focus-within:ring-2 focus-within:ring-primary/30"
        :class="[
          large ? 'rounded-[28px] p-4' : 'rounded-3xl p-3',
          fileDrop.dragging.value && canAttach ? 'border-primary ring-2 ring-primary/30' : '',
        ]"
        @dragenter="canAttach && fileDrop.onDragEnter($event)"
        @dragover="canAttach && fileDrop.onDragOver($event)"
        @dragleave="canAttach && fileDrop.onDragLeave($event)"
        @drop="onFilesDropped"
      >
      <ul v-if="attachments.length > 0" class="mb-2 flex flex-wrap gap-1.5">
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

      <!-- Row 1: the message itself, full width. -->
      <div class="flex items-start gap-2">
        <SparklesIcon class="mt-2.5 size-4 shrink-0 text-muted-foreground/40" aria-hidden="true" />
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
      </div>

      <!-- Row 2: the toolbar — actions on the left, send on the right. -->
      <div class="mt-2 flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5">
          <button
            v-if="canAttach"
            type="button"
            :class="pillClass"
            :disabled="disabled || readonly"
            title="Attach a document"
            @click="pickFiles"
          >
            <PaperclipIcon class="size-3.5 shrink-0" />
            Attach
          </button>
          <input
            ref="fileInput"
            type="file"
             :accept="canUsePdf ? '.pdf,.docx,.txt,.md,.jpg,.jpeg,.png,.webp,.gif,.tiff,.heic' : '.docx,.txt,.md,.jpg,.jpeg,.png,.webp,.gif,.tiff,.heic'"
            multiple
            class="hidden"
            @change="onFilesSelected"
          />

          <ChatHelpGuide :context="helpContext" />
        </div>

        <Button
          v-if="streaming"
          type="button"
          size="icon"
          :class="sendCircleClass"
          title="Stop generating"
          aria-label="Stop generating"
          @click="emit('stop')"
        >
          <SquareIcon class="size-3.5" />
        </Button>
        <Button
          v-else
          type="button"
          size="icon"
          :class="sendCircleClass"
          :disabled="sendDisabled"
          :title="sendTitle"
          aria-label="Send"
          @click="submit"
        >
          <Loader2Icon v-if="disabled" class="size-4 animate-spin" />
          <ArrowUpIcon v-else class="size-5" />
        </Button>
      </div>
      </div>
      </div>
    </div>

    <p v-if="dropError" id="chat-composer-status" role="alert" class="mt-1.5 px-1 text-center text-[11px] text-destructive">
      {{ dropError }}
    </p>
     <p v-else-if="attachmentPending" id="chat-composer-status" aria-live="polite" class="mt-1.5 px-1 text-center text-[11px] text-muted-foreground">
       Preparing your attachment — you can send as soon as it is ready.
     </p>
    <p class="mt-8 flex items-center justify-center gap-1 px-1 text-center text-[11px] text-muted-foreground/80">
      <SparklesIcon class="size-3 shrink-0" />
      Batayan AI can make mistakes — verify important legal details before acting on them.
    </p>
  </div>
</template>

<style scoped>
/*
 * The static rainbow base — the crisp ring at the card's edge and its
 * blurred echo just past it. Fixed, not rotating: every color sits on its
 * own stretch of the border all the time, so the rainbow never rotates in
 * and out of view. Both use the same gap-free sweep so the colors blend
 * straight into each other around the whole perimeter.
 */
.composer-ring-glow,
.composer-ray-glow {
  background: conic-gradient(from 0deg, var(--cite), #22d3ee, #818cf8, #e879f9, #fb923c, var(--cite));
}

/*
 * The shine: a single bright wedge, mostly transparent otherwise, blended
 * with `screen` so it brightens whatever rainbow color it passes over
 * instead of covering it. This is the layer that actually spins — the
 * rainbow underneath stays put.
 */
.composer-ring-shine {
  background: conic-gradient(
    from 0deg,
    transparent 0%,
    transparent 85%,
    rgba(255, 255, 255, 0.95) 93%,
    transparent 100%
  );
  mix-blend-mode: screen;
  animation: composer-shine-spin 3s linear infinite;
}

@keyframes composer-shine-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .composer-ring-shine {
    animation: none;
    opacity: 0;
  }
}
</style>
