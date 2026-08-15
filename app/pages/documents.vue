<script setup lang="ts">
import { toast } from '~/components/ui/sonner'
import { FileUpIcon, Loader2Icon, FileIcon, LinkIcon, FilterIcon, SparklesIcon } from '@lucide/vue'
import { useCaseStore } from '~/stores/cases'
import { useLabelStore, type AppliedLabel } from '~/stores/labels'
import { upgradeMessage } from '~/stores/billing'
import DocumentViewer from '~/components/DocumentViewer.vue'
import LabelPicker from '~/components/LabelPicker.vue'
import FileTagDialog from '~/components/FileTagDialog.vue'

definePageMeta({
  middleware: ['auth', 'onboarding', 'subscription'],
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
  categories: AppliedLabel[]
  created_at: string
}

const api = useApi()
const caseStore = useCaseStore()
const labelStore = useLabelStore()
const fileDrop = useFileDrop()
const { download: downloadDocument } = useDocumentFile()
// EmptyState keeps the generic glyph: it stands for no file in particular.
const { fileIcon } = useFileTypeIcon()

const cases = computed(() => caseStore.cases)
const attachTarget = ref<Document | null>(null)
const attachCaseId = ref('')
const attaching = ref(false)
const viewing = ref<Document | null>(null)

const view = useViewMode('documents', 'list')

/**
 * The filing dialog is a bulk view over every document, so one instance lives
 * at the page root and each row merely opens it. Rendering one per row — as
 * this page used to — meant three copies once the layouts multiplied.
 */
const tagOpen = ref(false)

const documents = ref<Document[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFiles = ref<File[]>([])
const uploading = ref(false)
const errorMessage = ref('')
const loading = ref(false)
const polling = ref(false)
const retrying = ref<Set<string>>(new Set())
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

/**
 * A document can be filed under several categories at once, so the filter
 * needs to say how a multi-category selection reads: `any` widens the net,
 * `all` narrows to the documents doing every one of those jobs.
 */
const filterCategoryIds = ref<string[]>([])
const matchMode = ref<'any' | 'all'>('any')
const showUnfiled = ref(false)

const filtering = computed(() => filterCategoryIds.value.length > 0 || showUnfiled.value)

function documentQuery() {
  const params = new URLSearchParams()
  for (const id of filterCategoryIds.value) params.append('category_id[]', id)
  if (filterCategoryIds.value.length > 1) params.append('match', matchMode.value)
  if (showUnfiled.value) params.append('uncategorized', '1')
  const query = params.toString()
  return query ? `?${query}` : ''
}

function clearFilters() {
  filterCategoryIds.value = []
  showUnfiled.value = false
}

async function loadDocuments() {
  loading.value = true
  try {
    const { data } = await api<{ data: Document[] }>(`/documents${documentQuery()}`)
    toastStatusChanges(data)
    documents.value = data
  } catch {
    // keep the current list on transient errors
  } finally {
    loading.value = false
    schedulePolling()
  }
}

watch([filterCategoryIds, matchMode, showUnfiled], () => {
  void loadDocuments()
})

/**
 * Whether the filing on a document is still just the classifier's suggestion.
 * Worth flagging: a suggested category is a starting point a lawyer should
 * confirm, and confirming it is a matter of touching the picker.
 */
function isSuggested(doc: Document) {
  return (doc.categories ?? []).some((category) => category.source === 'ai')
}

/**
 * File a document under a new set of categories. The picker sends the whole
 * set it is showing, so this replaces rather than merges.
 */
async function updateCategories(file: { id: string }, ids: string[]) {
  // The dialog emits its own narrower shape. Resolve it back to the row this
  // page owns, so the optimistic write lands on the object being rendered.
  const doc = documents.value.find((d) => d.id === file.id)
  if (!doc) return

  const previous = doc.categories ?? []

  doc.categories = ids
    .map((id) => labelStore.byId.get(id))
    .filter((label): label is NonNullable<typeof label> => label !== undefined)

  try {
    const { data } = await api<{ data: Document }>(`/documents/${doc.id}`, {
      method: 'PATCH',
      body: { label_ids: ids },
    })
    doc.categories = data.categories
  } catch (err: any) {
    doc.categories = previous
    toast.error(err?.data?.message ?? 'Could not update the categories')
  }
}

onMounted(() => {
  loadDocuments()
  void labelStore.fetchLabels()
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
  let upgradeHit = false

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
        upgradeHit = true
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

  if (!upgradeHit && selectedFiles.value.length === 0 && files.length > failures.length) {
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

async function retryDocument(doc: Document) {
  if (retrying.value.has(doc.id)) return
  retrying.value.add(doc.id)
  try {
    await api(`/documents/${doc.id}/retry`, { method: 'POST' })
    toast.success(`"${doc.original_filename}" will be reprocessed`)
    await loadDocuments()
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not retry the document')
  } finally {
    retrying.value.delete(doc.id)
  }
}
</script>

<template>
  <div>
    <div class="mx-auto w-full max-w-4xl px-4 py-6">
    <PageHeader
      title="My documents"
      description="Upload legal documents to ground your chat answers in your own files."
    />

    <div
      data-tour="documents-upload"
      class="surface-inset border-dashed p-6 transition-colors"
      :class="fileDrop.dragging.value ? 'border-primary bg-primary/5' : ''"
      @dragenter="fileDrop.onDragEnter"
      @dragover="fileDrop.onDragOver"
      @dragleave="fileDrop.onDragLeave"
      @drop="onFilesDropped"
    >
      <div class="flex flex-col items-center gap-3 text-center">
        <div class="flex size-12 items-center justify-center rounded-full bg-card shadow-sm">
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
        <Button :loading="uploading" @click="pickFile">
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
          class="flex items-center gap-3 rounded-lg bg-card p-3 text-sm shadow-sm"
        >
          <component :is="fileIcon(file.name, file.type)" class="size-4 shrink-0 text-muted-foreground" />
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
          <Button :loading="uploading" @click="upload">
            {{ uploading ? 'Uploading…' : `Upload ${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'}` }}
          </Button>
        </div>
      </div>

      <p v-if="errorMessage" class="mt-3 text-sm text-destructive">
        {{ errorMessage }}
      </p>
    </div>

    <div class="mt-8 space-y-2">
      <div class="surface flex flex-wrap items-center gap-2 px-3 py-2.5">
        <FilterIcon class="size-3.5 shrink-0 text-muted-foreground" />
        <LabelPicker
          v-model="filterCategoryIds"
          kind="document_category"
          trigger-label="Category"
          :max="5"
        />

        <div v-if="filterCategoryIds.length > 1" class="flex items-center gap-1 text-xs text-muted-foreground">
          <button
            type="button"
            class="rounded px-1.5 py-0.5"
            :class="matchMode === 'any' ? 'bg-accent text-foreground' : 'hover:text-foreground'"
            @click="matchMode = 'any'"
          >
            Any
          </button>
          <button
            type="button"
            class="rounded px-1.5 py-0.5"
            :class="matchMode === 'all' ? 'bg-accent text-foreground' : 'hover:text-foreground'"
            @click="matchMode = 'all'"
          >
            All
          </button>
        </div>

        <button
          type="button"
          class="rounded-md border px-2 py-0.5 text-xs"
          :class="showUnfiled ? 'border-primary bg-primary/10 text-primary' : 'border-dashed text-muted-foreground hover:text-foreground'"
          @click="showUnfiled = !showUnfiled"
        >
          Unfiled
        </button>

        <button
          v-if="filtering"
          type="button"
          class="ml-auto text-xs text-muted-foreground underline-offset-2 hover:underline"
          @click="clearFilters"
        >
          Clear
        </button>
      </div>

      <div v-if="!loading && documents.length > 0" class="flex items-center gap-3">
        <h2 class="text-sm font-medium text-muted-foreground">
          {{ documents.length }} document{{ documents.length === 1 ? '' : 's' }}
        </h2>
        <ViewModeToggle v-model="view" class="ml-auto" />
      </div>

      <ListSkeleton v-if="loading" :rows="3" />

      <EmptyState
        v-else-if="documents.length === 0 && filtering"
        :icon="FilterIcon"
        title="No documents match"
        description="No document is filed under that combination. Try widening the filter or clearing it."
      />

      <EmptyState
        v-else-if="documents.length === 0"
        :icon="FileIcon"
        title="No documents yet"
        description="Upload your first file above to ground the assistant's answers in your own material."
      />

      <!-- List: one dense row each, the layout this page has always had. -->
      <template v-if="view === 'list'">
        <div v-for="doc in documents" :key="doc.id" class="surface overflow-hidden">
          <div class="flex items-center gap-3 p-4">
            <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <component :is="fileIcon(doc.original_filename, doc.mime_type)" class="size-4" />
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
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" class="h-6 px-2 text-xs" @click="tagOpen = true">
                  File under
                </Button>
                <span
                  v-if="isSuggested(doc)"
                  class="inline-flex items-center gap-1 rounded-md bg-peach/40 px-1.5 py-0.5 text-[10px] text-espresso dark:bg-cream/10 dark:text-peach"
                  title="Filed automatically from the document's contents — confirm or change it."
                >
                  <SparklesIcon class="size-3" />
                  Suggested
                </span>
              </div>
            </div>
            <DocumentActions
              :document="doc"
              :attaching="attachTarget?.id === doc.id"
              :retrying="retrying.has(doc.id)"
              @view="viewing = doc"
              @download="downloadDocument(doc.id, doc.original_filename)"
              @retry="retryDocument(doc)"
              @toggle-attach="toggleAttach(doc)"
              @remove="removeDocument(doc)"
            />
          </div>

          <DocumentAttachPanel
            v-if="attachTarget?.id === doc.id"
            v-model="attachCaseId"
            :cases="cases"
            :busy="attaching"
            @attach="attachDocument"
            @cancel="attachTarget = null"
          />
        </div>
      </template>

      <!--
        Card: the filename and status get the room. The actions sit on their own
        footer line so they align across the grid instead of landing wherever a
        long title happens to push them.
      -->
      <div v-else-if="view === 'card'" class="grid gap-3 sm:grid-cols-2">
        <div v-for="doc in documents" :key="doc.id" class="surface flex flex-col overflow-hidden">
          <div class="flex flex-1 flex-col gap-3 p-4">
            <div class="flex items-start gap-3">
              <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <component :is="fileIcon(doc.original_filename, doc.mime_type)" class="size-4" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="line-clamp-2 text-sm font-medium">{{ doc.title }}</p>
                <p class="mt-0.5 truncate text-xs text-muted-foreground">{{ doc.original_filename }}</p>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-1.5">
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
              <span
                v-if="isSuggested(doc)"
                class="inline-flex items-center gap-1 rounded-md bg-peach/40 px-1.5 py-0.5 text-[10px] text-espresso dark:bg-cream/10 dark:text-peach"
                title="Filed automatically from the document's contents — confirm or change it."
              >
                <SparklesIcon class="size-3" />
                Suggested
              </span>
            </div>

            <p class="text-xs text-muted-foreground">
              <span v-if="doc.status === 'ready'">{{ doc.chunk_count }} chunks · </span>
              <span v-else-if="doc.status === 'failed' && doc.error_message">{{ doc.error_message }} · </span>
              {{ formatDate(doc.created_at) }}
            </p>

            <div class="mt-auto flex items-center gap-2 border-t pt-3">
              <Button variant="outline" size="sm" class="h-7 px-2 text-xs" @click="tagOpen = true">
                File under
              </Button>
              <DocumentActions
                class="ml-auto"
                compact
                :document="doc"
                :attaching="attachTarget?.id === doc.id"
                :retrying="retrying.has(doc.id)"
                @view="viewing = doc"
                @download="downloadDocument(doc.id, doc.original_filename)"
                @retry="retryDocument(doc)"
                @toggle-attach="toggleAttach(doc)"
                @remove="removeDocument(doc)"
              />
            </div>
          </div>

          <DocumentAttachPanel
            v-if="attachTarget?.id === doc.id"
            v-model="attachCaseId"
            :cases="cases"
            :busy="attaching"
            @attach="attachDocument"
            @cancel="attachTarget = null"
          />
        </div>
      </div>

      <!--
        Table: columns are the point, so it scrolls sideways on a narrow screen
        rather than reflowing into something that is no longer a table. The
        attach strip becomes a full-width row under the document it belongs to.
      -->
      <div v-else class="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead>Status</TableHead>
              <TableHead class="hidden md:table-cell">Filing</TableHead>
              <TableHead class="hidden sm:table-cell">Added</TableHead>
              <TableHead class="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-for="doc in documents" :key="doc.id">
              <TableRow>
                <TableCell class="max-w-[20rem]">
                  <div class="flex items-center gap-2">
                    <component :is="fileIcon(doc.original_filename, doc.mime_type)" class="size-3.5 shrink-0 text-muted-foreground" />
                    <div class="min-w-0">
                      <p class="truncate text-sm font-medium">{{ doc.title }}</p>
                      <p class="truncate text-[11px] text-muted-foreground">{{ doc.original_filename }}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div class="flex flex-wrap items-center gap-1">
                    <span class="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium" :class="statusStyles[doc.status]">
                      <Loader2Icon v-if="doc.status === 'queued' || doc.status === 'processing'" class="size-3 animate-spin" />
                      {{ statusLabel[doc.status] }}
                    </span>
                    <span
                      v-if="doc.case_id"
                      class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                      title="Attached to a case"
                    >
                      <LinkIcon class="size-3" />
                    </span>
                  </div>
                </TableCell>
                <TableCell class="hidden md:table-cell">
                  <div class="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" class="h-6 px-2 text-xs" @click="tagOpen = true">
                      File under
                    </Button>
                    <SparklesIcon
                      v-if="isSuggested(doc)"
                      class="size-3 text-espresso dark:text-peach"
                      aria-label="Filed automatically — confirm or change it"
                    />
                  </div>
                </TableCell>
                <TableCell class="hidden whitespace-nowrap text-xs text-muted-foreground sm:table-cell">
                  {{ formatDate(doc.created_at) }}
                </TableCell>
                <TableCell>
                  <DocumentActions
                    class="justify-end"
                    compact
                    :document="doc"
                    :attaching="attachTarget?.id === doc.id"
                    :retrying="retrying.has(doc.id)"
                    @view="viewing = doc"
                    @download="downloadDocument(doc.id, doc.original_filename)"
                    @retry="retryDocument(doc)"
                    @toggle-attach="toggleAttach(doc)"
                    @remove="removeDocument(doc)"
                  />
                </TableCell>
              </TableRow>
              <TableRow v-if="attachTarget?.id === doc.id">
                <TableCell colspan="5" class="p-0">
                  <DocumentAttachPanel
                    v-model="attachCaseId"
                    :cases="cases"
                    :busy="attaching"
                    @attach="attachDocument"
                    @cancel="attachTarget = null"
                  />
                </TableCell>
              </TableRow>
            </template>
          </TableBody>
        </Table>
      </div>
    </div>

    <!--
      One filing dialog for the whole page rather than one per row: it is a
      bulk view over every document, and each row's "File under" simply opens
      it. Rendering it here also keeps it alive when the layout switches.
    -->
    <FileTagDialog
      v-model:open="tagOpen"
      kind="document_category"
      hide-trigger
      :max="5"
      :files="documents"
      @update-file="(file, ids) => updateCategories(file, ids)"
    />

    <DocumentViewer v-if="viewing" :document="viewing" @close="viewing = null" />
    </div>
  </div>
</template>
