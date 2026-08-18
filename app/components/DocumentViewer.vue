<script setup lang="ts">
import { DownloadIcon, Loader2Icon, XIcon } from '@lucide/vue'
import { renderMarkdown } from '~/utils/markdown'

export interface ViewerDocument {
  id: string
  title: string
  original_filename: string
  mime_type: string
}

const props = withDefaults(defineProps<{ document: ViewerDocument; zClass?: string }>(), {
  zClass: 'z-50',
})
const emit = defineEmits<{ close: [] }>()

const { fetchBlob, objectUrl, download } = useDocumentFile()
const { fileIcon } = useFileTypeIcon()

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const TEXT_MIME_TYPES = new Set(['text/plain', 'text/markdown', 'text/md', 'text/x-markdown'])
const MARKDOWN_MIME_TYPES = new Set(['text/markdown', 'text/md', 'text/x-markdown'])

function isTextFile(name: string): boolean {
  const lower = name.toLowerCase()
  return (
    lower.endsWith('.md') ||
    lower.endsWith('.markdown') ||
    lower.endsWith('.txt') ||
    lower.endsWith('.text')
  )
}

const isPdf = computed(() => props.document.mime_type === 'application/pdf')
const isImage = computed(() => props.document.mime_type.startsWith('image/'))
const isDocx = computed(() => {
  if (props.document.mime_type === DOCX_MIME_TYPE) return true
  return props.document.original_filename.toLowerCase().endsWith('.docx')
})
const isText = computed(() => {
  if (TEXT_MIME_TYPES.has(props.document.mime_type)) return true
  return isTextFile(props.document.original_filename)
})
const isMarkdown = computed(() => {
  if (MARKDOWN_MIME_TYPES.has(props.document.mime_type)) return true
  const name = props.document.original_filename.toLowerCase()
  return name.endsWith('.md') || name.endsWith('.markdown')
})

// The API authenticates a bearer token, which an iframe, img, or download
// anchor cannot send, so the file is fetched here and handed to the DOM as a
// blob: URL instead of a direct API URL.
const inlineUrl = ref<string | null>(null)
const text = ref<string | null>(null)
const textError = ref('')
const loadingText = ref(false)
const downloading = ref(false)
const docxContainer = ref<HTMLElement | null>(null)
const docxError = ref('')
const docxLoading = ref(false)
const docxRendered = ref(false)

async function loadPreview() {
  if (isDocx.value) {
    if (docxRendered.value) return

    docxLoading.value = true
    docxError.value = ''
    try {
      const blob = await fetchBlob(props.document.id)
      await nextTick()
      const container = docxContainer.value
      if (!container) throw new Error('Preview container not ready')
      const { renderAsync } = await import('docx-preview')
      await renderAsync(blob, container)
      docxRendered.value = true
    } catch (err: any) {
      docxError.value = err?.message ?? 'Could not render the document.'
    } finally {
      docxLoading.value = false
    }

    return
  }

  if (isText.value) {
    if (text.value !== null) return

    loadingText.value = true
    textError.value = ''
    try {
      text.value = await (await fetchBlob(props.document.id)).text()
    } catch (err: any) {
      textError.value = err?.message ?? 'Could not load the file content.'
    } finally {
      loadingText.value = false
    }

    return
  }

  if (!isPdf.value && !isImage.value) return

  try {
    inlineUrl.value = await objectUrl(props.document.id)
  } catch (err: any) {
    textError.value = err?.message ?? 'Could not load the file.'
  }
}

async function downloadFile() {
  downloading.value = true
  try {
    await download(props.document.id, props.document.original_filename)
  } finally {
    downloading.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => {
  void loadPreview()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  // The blob holds the whole file in memory until it is revoked.
  if (inlineUrl.value) {
    URL.revokeObjectURL(inlineUrl.value)
    inlineUrl.value = null
  }

  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div :class="['fixed inset-0 flex items-center justify-center p-4 sm:p-6', props.zClass]">
      <div class="absolute inset-0 bg-black/60" @click="emit('close')" />
      <div
        role="dialog"
        aria-modal="true"
        :aria-label="`Preview ${document.title}`"
        class="relative flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-popover shadow-xl"
      >
        <div class="flex items-center justify-between gap-3 border-b px-4 py-2.5">
          <div class="flex min-w-0 items-center gap-2">
            <component :is="fileIcon(document.original_filename, document.mime_type)" class="size-4 shrink-0 text-muted-foreground" />
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">{{ document.title }}</p>
              <p class="truncate text-[11px] text-muted-foreground">{{ document.original_filename }}</p>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button
              type="button"
              :disabled="downloading"
              class="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              @click="downloadFile"
            >
              <DownloadIcon class="size-3.5" />
              Download
            </button>
            <Button variant="ghost" size="icon" class="size-7" aria-label="Close preview" @click="emit('close')">
              <XIcon class="size-4" />
            </Button>
          </div>
        </div>

        <div v-if="isPdf" class="min-h-0 flex-1">
          <iframe v-if="inlineUrl" :src="inlineUrl" class="h-full w-full border-0" title="Document preview" />
          <div v-else class="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon class="size-4 animate-spin" />
            Loading…
          </div>
        </div>

        <div v-else-if="isImage" class="min-h-0 flex-1 overflow-auto bg-muted/30 p-6">
          <img v-if="inlineUrl" :src="inlineUrl" :alt="document.original_filename" class="mx-auto max-h-full max-w-full object-contain" />
        </div>

        <div v-else-if="isDocx" class="relative min-h-0 flex-1 overflow-auto">
          <div ref="docxContainer" class="p-4" />
          <div
            v-if="docxLoading"
            class="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-card text-sm text-muted-foreground"
          >
            <Loader2Icon class="size-4 animate-spin" />
            Loading…
          </div>
          <div
            v-else-if="docxError"
            class="absolute inset-0 z-10 flex items-center justify-center bg-card p-6 text-center text-sm text-destructive"
          >
            {{ docxError }}
          </div>
        </div>

        <div v-else-if="isText" class="min-h-0 flex-1 overflow-auto">
          <div v-if="loadingText" class="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon class="size-4 animate-spin" />
            Loading…
          </div>
          <p v-else-if="textError" class="p-6 text-center text-sm text-destructive">{{ textError }}</p>
          <div v-else-if="isMarkdown" class="markdown-body p-6 text-sm" v-html="renderMarkdown(text ?? '')" />
          <pre v-else class="whitespace-pre-wrap break-words p-6 font-sans text-sm leading-relaxed">{{ text }}</pre>
        </div>

        <div v-else class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
          <span>This file type cannot be previewed inline.</span>
          <button
            type="button"
            :disabled="downloading"
            class="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            @click="downloadFile"
          >
            <DownloadIcon class="size-3.5" />
            Download {{ document.original_filename }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
