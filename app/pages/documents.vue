<script setup lang="ts">
import { toast } from '~/components/ui/sonner'
import { FileUpIcon, Loader2Icon, TrashIcon, FileIcon, LinkIcon, EyeIcon, DownloadIcon } from '@lucide/vue'
import { useCaseStore } from '~/stores/cases'
import { upgradeMessage } from '~/stores/billing'
import DocumentViewer from '~/components/DocumentViewer.vue'

definePageMeta({
  middleware: ['auth', 'organization', 'subscription'],
})

interface Document {
  id: string
  title: string
  original_filename: string
  mime_type: string
  status: 'queued' | 'processing' | 'ready' | 'failed'
  error_message: string | null
  chunk_count: number
  case_id: string | null
  created_at: string
}

const api = useApi()
const caseStore = useCaseStore()
const fileDrop = useFileDrop()
const { fileUrl } = useDocumentFile()

const cases = computed(() => caseStore.cases)
const attachTarget = ref<Document | null>(null)
const attachCaseId = ref('')
const attaching = ref(false)
const viewing = ref<Document | null>(null)

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
  processing: 'bg-peach/60 text-espresso dark:bg-cream/10 dark:text-peach',
  ready: 'bg-forest/10 text-forest dark:bg-cream/10 dark:text-peach',
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

onMounted(() => {
  loadDocuments()
  if (caseStore.cases.length === 0) void caseStore.fetchCases()
})

function toggleAttach(doc: Document) {
  if (attachTarget.value?.id === doc.id) {
    attachTarget.value = null
    return
  }
  attachTarget.value = doc
  attachCaseId.value = ''
}

async function attachDocument() {
  if (!attachTarget.value || !attachCaseId.value || attaching.value) return
  attaching.value = true
  const target = attachTarget.value
  const caseTitle = cases.value.find((c) => c.id === attachCaseId.value)?.title ?? 'a case'
  try {
    await api(`/documents/${target.id}/attach`, {
      method: 'POST',
      body: { case_id: attachCaseId.value },
    })
    toast.success(`Attached "${target.original_filename}" to ${caseTitle}`)
    attachTarget.value = null
    attachCaseId.value = ''
    await loadDocuments()
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not attach the document')
  } finally {
    attaching.value = false
  }
}

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

function onFilesDropped(event: DragEvent) {
  const rejected = fileDrop.onDrop(event, (files) => {
    selectedFiles.value.push(...files)
    errorMessage.value = ''
  })

  if (rejected.length > 0) {
    errorMessage.value = `"${rejected[0].name}" is not a supported file type. Use PDF, DOCX, TXT, MD, or an image.`
  }
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
      const upgrade = upgradeMessage(err)
      if (upgrade) {
        toast.error(`${upgrade}. Upgrade your plan to continue.`, { action: { label: 'Upgrade', onClick: () => navigateTo('/settings/billing') } })
        selectedFiles.value = selectedFiles.value.filter((f) => f !== file)
        break
      }
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
  <div>
    <div class="mx-auto w-full max-w-4xl px-4 py-8">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold">My documents</h1>
        <p class="mt-0.5 text-sm text-muted-foreground">
          Upload legal documents to ground your chat answers in your own files.
        </p>
      </div>
    </div>

    <div
      class="rounded-xl border border-dashed bg-muted/30 p-6 transition-colors"
      :class="fileDrop.dragging.value ? 'border-primary bg-primary/5' : ''"
      @dragenter="fileDrop.onDragEnter"
      @dragover="fileDrop.onDragOver"
      @dragleave="fileDrop.onDragLeave"
      @drop="onFilesDropped"
    >
      <div class="flex flex-col items-center gap-3 text-center">
        <div class="flex size-12 items-center justify-center rounded-full bg-background shadow-sm">
          <FileUpIcon class="size-5 text-muted-foreground" />
        </div>
        <div>
          <p class="text-sm font-medium">PDF, DOCX, TXT, MD, or image (OCR) — up to 25 MB</p>
          <p class="mt-0.5 text-xs text-muted-foreground">
            Drag and drop files here, or
            <button type="button" class="font-medium text-primary underline-offset-2 hover:underline" @click="pickFile">
              choose them
            </button>
            .
          </p>
        </div>
        <Button @click="pickFile" :disabled="uploading">
          <Loader2Icon v-if="uploading" class="size-4 animate-spin" />
          {{ uploading ? 'Uploading…' : 'Choose files' }}
        </Button>
        <input
          ref="fileInput"
          type="file"
          accept=".pdf,.docx,.txt,.md,.jpg,.jpeg,.png,.webp,.gif,.tiff,.heic"
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

      <div v-for="doc in documents" :key="doc.id" class="rounded-xl border bg-card">
        <div class="flex items-center gap-3 p-4">
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
              <span
                v-if="doc.case_id"
                class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
              >
                <LinkIcon class="size-3" />
                In case
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
            class="shrink-0 text-muted-foreground hover:text-foreground"
            @click="viewing = doc"
          >
            <EyeIcon class="size-4" />
            <span class="sr-only">View {{ doc.title }}</span>
          </Button>
          <a
            :href="fileUrl(doc.id, 'attachment')"
            class="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            :aria-label="`Download ${doc.title}`"
          >
            <DownloadIcon class="size-4" />
          </a>
          <Button
            variant="ghost"
            size="icon"
            class="shrink-0 text-muted-foreground hover:text-foreground"
            :class="{ 'bg-accent text-foreground': attachTarget?.id === doc.id }"
            @click="toggleAttach(doc)"
          >
            <LinkIcon class="size-4" />
            <span class="sr-only">Attach {{ doc.title }} to a case</span>
          </Button>
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

        <div v-if="attachTarget?.id === doc.id" class="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-4 py-3">
          <Select v-model="attachCaseId" class="w-64">
            <SelectTrigger class="text-sm">
              <SelectValue :placeholder="cases.length === 0 ? 'No cases yet' : 'Choose a case…'" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="c in cases" :key="c.id" :value="c.id">
                {{ c.title }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" :disabled="attaching || !attachCaseId" @click="attachDocument">
            <Loader2Icon v-if="attaching" class="size-3 animate-spin" />
            Attach
          </Button>
          <Button variant="ghost" size="sm" @click="attachTarget = null">
            Cancel
          </Button>
          <p class="ml-auto text-[11px] text-muted-foreground">
            This document becomes retrievable in that case's conversations.
          </p>
        </div>
      </div>
    </div>

    <DocumentViewer v-if="viewing" :document="viewing" @close="viewing = null" />
    </div>
  </div>
</template>
