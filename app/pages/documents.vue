<script setup lang="ts">
import { toast } from 'vue-sonner'
import { FileUpIcon, Loader2Icon, TrashIcon, FileIcon } from '@lucide/vue'

definePageMeta({
  middleware: 'auth',
})

interface Document {
  id: string
  title: string
  original_filename: string
  mime_type: string
  status: 'queued' | 'processing' | 'ready' | 'failed'
  error_message: string | null
  chunk_count: number
  created_at: string
}

const api = useApi()

const documents = ref<Document[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFiles = ref<File[]>([])
const uploading = ref(false)
const errorMessage = ref('')
const loading = ref(false)
const polling = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null

const statusStyles: Record<Document['status'], string> = {
  queued: 'bg-muted text-muted-foreground',
  processing: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  ready: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  failed: 'bg-destructive/10 text-destructive',
}

const statusLabel: Record<Document['status'], string> = {
  queued: 'Queued',
  processing: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function hasPending() {
  return documents.value.some((d) => d.status === 'queued' || d.status === 'processing')
}

function toastStatusChanges(next: Document[]) {
  const previous = new Map(documents.value.map((d) => [d.id, d.status]))

  for (const doc of next) {
    const prevStatus = previous.get(doc.id)
    if (!prevStatus || prevStatus === doc.status) continue
    if (prevStatus !== 'queued' && prevStatus !== 'processing') continue

    if (doc.status === 'ready') {
      toast.success(`"${doc.original_filename}" is ready to use`)
    } else if (doc.status === 'failed') {
      toast.error(`"${doc.original_filename}" could not be processed`)
    }
  }
}

function schedulePolling() {
  const pending = hasPending()
  if (pending && pollTimer === null) {
    pollTimer = setInterval(pollDocuments, 3000)
  } else if (!pending && pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function pollDocuments() {
  if (polling.value) return
  polling.value = true
  try {
    await loadDocuments()
  } finally {
    polling.value = false
  }
}

async function loadDocuments() {
  loading.value = true
  try {
    const { data } = await api<{ data: Document[] }>('/documents')
    toastStatusChanges(data)
    documents.value = data
  } catch {
    // keep the current list on transient errors
  } finally {
    loading.value = false
    schedulePolling()
  }
}

onMounted(() => loadDocuments())

onBeforeUnmount(() => {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})

function pickFile() {
  fileInput.value?.click()
}

function onFileSelected(event: Event) {
  const target = event.target as HTMLInputElement
  const picked = target.files ? Array.from(target.files) : []
  selectedFiles.value.push(...picked)
  target.value = ''
  errorMessage.value = ''
}

function removeSelected(index: number) {
  selectedFiles.value.splice(index, 1)
}

async function upload() {
  if (selectedFiles.value.length === 0 || uploading.value) return

  uploading.value = true
  errorMessage.value = ''

  const files = [...selectedFiles.value]
  const failures: string[] = []

  for (const file of files) {
    const form = new FormData()
    form.append('file', file)

    try {
      await api('/documents', {
        method: 'POST',
        body: form,
      })
      selectedFiles.value = selectedFiles.value.filter((f) => f !== file)
    } catch (err: any) {
      failures.push(err?.data?.message ?? `"${file.name}" failed`)
    }
  }

  if (failures.length > 0) {
    errorMessage.value = failures[0] ?? 'Upload failed. Please try again.'
  }

  if (selectedFiles.value.length === 0 && files.length > failures.length) {
    toast.success(`${files.length - failures.length} document${files.length - failures.length === 1 ? '' : 's'} uploaded`)
  }

  if (files.length > 0 && files.length === failures.length) {
    toast.error('All uploads failed')
  }

  uploading.value = false
  await loadDocuments()
}

async function removeDocument(doc: Document) {
  try {
    await api(`/documents/${doc.id}`, { method: 'DELETE' })
    toast.success(`Deleted ${doc.original_filename}`)
    await loadDocuments()
  } catch {
    toast.error('Could not delete the document')
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-4xl px-4 py-8">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold">My documents</h1>
        <p class="mt-0.5 text-sm text-muted-foreground">
          Upload legal documents to ground your chat answers in your own files.
        </p>
      </div>
    </div>

    <div class="rounded-xl border border-dashed bg-muted/30 p-6">
      <div class="flex flex-col items-center gap-3 text-center">
        <div class="flex size-12 items-center justify-center rounded-full bg-background shadow-sm">
          <FileUpIcon class="size-5 text-muted-foreground" />
        </div>
        <div>
          <p class="text-sm font-medium">PDF, DOCX, TXT, or MD — up to 15 MB</p>
          <p class="mt-0.5 text-xs text-muted-foreground">
            Files are parsed, chunked, and embedded for retrieval.
          </p>
        </div>
        <Button @click="pickFile" :disabled="uploading">
          <Loader2Icon v-if="uploading" class="size-4 animate-spin" />
          {{ uploading ? 'Uploading…' : 'Choose files' }}
        </Button>
        <input
          ref="fileInput"
          type="file"
          accept=".pdf,.docx,.txt,.md"
          multiple
          class="hidden"
          @change="onFileSelected"
        />
      </div>

      <div v-if="selectedFiles.length > 0" class="mt-4 space-y-2">
        <div
          v-for="(file, index) in selectedFiles"
          :key="`${file.name}-${index}`"
          class="flex items-center gap-3 rounded-lg bg-background p-3 text-sm shadow-sm"
        >
          <FileIcon class="size-4 shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1 truncate">{{ file.name }}</span>
          <span class="shrink-0 text-xs text-muted-foreground">{{ formatBytes(file.size) }}</span>
          <Button
            variant="ghost"
            size="sm"
            :disabled="uploading"
            @click="removeSelected(index)"
          >
            Remove
          </Button>
        </div>
        <div class="flex items-center justify-end">
          <Button @click="upload" :disabled="uploading">
            <Loader2Icon v-if="uploading" class="size-4 animate-spin" />
            {{ uploading ? 'Uploading…' : `Upload ${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'}` }}
          </Button>
        </div>
      </div>

      <p v-if="errorMessage" class="mt-3 text-sm text-destructive">
        {{ errorMessage }}
      </p>
    </div>

    <div class="mt-8 space-y-2">
      <h2 class="text-sm font-medium text-muted-foreground">
        {{ documents.length }} document{{ documents.length === 1 ? '' : 's' }}
      </h2>

      <div v-if="documents.length === 0" class="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        <span v-if="loading">Loading your documents…</span>
        <span v-else>No documents yet. Upload your first file to get started.</span>
      </div>

      <div v-for="doc in documents" :key="doc.id" class="flex items-center gap-3 rounded-xl border bg-card p-4">
        <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <FileIcon class="size-4" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <p class="truncate text-sm font-medium">{{ doc.title }}</p>
            <span class="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium" :class="statusStyles[doc.status]">
              <Loader2Icon v-if="doc.status === 'queued' || doc.status === 'processing'" class="size-3 animate-spin" />
              {{ statusLabel[doc.status] }}
            </span>
          </div>
          <p class="mt-0.5 truncate text-xs text-muted-foreground">
            {{ doc.original_filename }}
            <span v-if="doc.status === 'ready'"> · {{ doc.chunk_count }} chunks</span>
            <span v-else-if="doc.status === 'failed' && doc.error_message"> · {{ doc.error_message }}</span>
            <span> · {{ formatDate(doc.created_at) }}</span>
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          class="shrink-0 text-muted-foreground hover:text-destructive"
          @click="removeDocument(doc)"
        >
          <TrashIcon class="size-4" />
          <span class="sr-only">Delete {{ doc.title }}</span>
        </Button>
      </div>
    </div>
  </div>
</template>
