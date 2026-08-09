<script setup lang="ts">
import { DownloadIcon, FileIcon, Loader2Icon, XIcon } from '@lucide/vue'

export interface ViewerDocument {
  id: string
  title: string
  original_filename: string
  mime_type: string
}

const props = defineProps<{ document: ViewerDocument }>()
const emit = defineEmits<{ close: [] }>()

const { fileUrl } = useDocumentFile()

const TEXT_MIME_TYPES = new Set(['text/plain', 'text/markdown', 'text/md', 'text/x-markdown'])

const isPdf = computed(() => props.document.mime_type === 'application/pdf')
const isImage = computed(() => props.document.mime_type.startsWith('image/'))
const isText = computed(() => TEXT_MIME_TYPES.has(props.document.mime_type))

const inlineUrl = computed(() => fileUrl(props.document.id, 'inline'))
const downloadUrl = computed(() => fileUrl(props.document.id, 'attachment'))

const text = ref<string | null>(null)
const textError = ref('')
const loadingText = ref(false)

async function loadText() {
  if (!isText.value || text.value !== null) return
  loadingText.value = true
  textError.value = ''
  try {
    const response = await fetch(inlineUrl.value, { credentials: 'include' })
    if (!response.ok) throw new Error(`Could not load the file (HTTP ${response.status})`)
    text.value = await response.text()
  } catch (err: any) {
    textError.value = err?.message ?? 'Could not load the file content.'
  } finally {
    loadingText.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => {
  void loadText()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div class="absolute inset-0 bg-black/60" @click="emit('close')" />
      <div
        role="dialog"
        aria-modal="true"
        :aria-label="`Preview ${document.title}`"
        class="relative flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-background shadow-xl"
      >
        <div class="flex items-center justify-between gap-3 border-b px-4 py-2.5">
          <div class="flex min-w-0 items-center gap-2">
            <FileIcon class="size-4 shrink-0 text-muted-foreground" />
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">{{ document.title }}</p>
              <p class="truncate text-[11px] text-muted-foreground">{{ document.original_filename }}</p>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <a
              :href="downloadUrl"
              class="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <DownloadIcon class="size-3.5" />
              Download
            </a>
            <Button variant="ghost" size="icon" class="size-7" aria-label="Close preview" @click="emit('close')">
              <XIcon class="size-4" />
            </Button>
          </div>
        </div>

        <div v-if="isPdf" class="min-h-0 flex-1">
          <iframe :src="inlineUrl" class="h-full w-full border-0" title="Document preview" />
        </div>

        <div v-else-if="isImage" class="min-h-0 flex-1 overflow-auto bg-muted/30 p-6">
          <img :src="inlineUrl" :alt="document.original_filename" class="mx-auto max-h-full max-w-full object-contain" />
        </div>

        <div v-else-if="isText" class="min-h-0 flex-1 overflow-auto">
          <div v-if="loadingText" class="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon class="size-4 animate-spin" />
            Loading…
          </div>
          <p v-else-if="textError" class="p-6 text-center text-sm text-destructive">{{ textError }}</p>
          <pre v-else class="whitespace-pre-wrap break-words p-6 font-sans text-sm leading-relaxed">{{ text }}</pre>
        </div>

        <div v-else class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
          <span>This file type cannot be previewed inline.</span>
          <a
            :href="downloadUrl"
            class="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <DownloadIcon class="size-3.5" />
            Download {{ document.original_filename }}
          </a>
        </div>
      </div>
    </div>
  </Teleport>
</template>
