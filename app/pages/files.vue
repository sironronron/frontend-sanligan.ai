<script setup lang="ts">
import { toast } from '~/components/ui/sonner'
import { onClickOutside } from '@vueuse/core'
import {
  ArrowDownAZIcon,
  ArrowUpDownIcon,
  CalendarArrowUpIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  FileUpIcon,
  FolderIcon,
  FolderInputIcon,
  FolderOpenIcon,
  GripVerticalIcon,
  Loader2Icon,
  FileIcon,
  LinkIcon,
  MoreHorizontalIcon,
  PaletteIcon,
  PencilIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
  Trash2Icon,
  XIcon,
} from '@lucide/vue'
import { useAuthStore } from '~/stores/auth'
import { useCaseStore } from '~/stores/cases'
import { useLabelStore, type AppliedLabel, type Label } from '~/stores/labels'
import { upgradeMessage } from '~/stores/billing'
import DocumentViewer from '~/components/DocumentViewer.vue'
import FileTagDialog from '~/components/FileTagDialog.vue'

definePageMeta({
  middleware: ['auth', 'onboarding', 'subscription'],
})

interface Document {
  id: string
  user_id: string
  uploaded_by?: string
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
const auth = useAuthStore()
const caseStore = useCaseStore()
const labelStore = useLabelStore()
const fileDrop = useFileDrop()
const { download: downloadDocument } = useDocumentFile()
const { fileIcon } = useFileTypeIcon()

const cases = computed(() => caseStore.cases)

function uploaderLabel(doc: Document) {
  if (!doc.uploaded_by || doc.user_id === auth.user?.id) return null
  return doc.uploaded_by
}

// --- Folder sidebar ---
const selectedFolderId = ref<string | null>(null)
const newFolderName = ref('')
const creatingFolder = ref(false)

const folders = computed(() => labelStore.documentCategories)

/**
 * Folders bucketed under their sub-category headings ("Evidence",
 * "Pleadings & submissions", ...). Custom folders carry no group, so they
 * land under a heading of their own, pinned to the top.
 */
const folderGroups = computed(() => {
  const groups = labelStore.grouped('document_category').map((group) => ({
    ...group,
    name: group.name === 'Your labels' ? 'My folders' : group.name,
  }))
  return [
    ...groups.filter((group) => group.name === 'My folders'),
    ...groups.filter((group) => group.name !== 'My folders'),
  ]
})

/** Full unfiltered list — always fetched, used only for sidebar counts. */
const allDocuments = ref<Document[]>([])

const folderDocCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const doc of allDocuments.value) {
    const cat = doc.categories?.[0]
    if (cat) {
      counts.set(cat.id, (counts.get(cat.id) ?? 0) + 1)
    }
  }
  return counts
})

const unfiledCount = computed(() =>
  allDocuments.value.filter(d => !d.categories || d.categories.length === 0).length,
)

function selectFolder(id: string | null) {
  selectedFolderId.value = id
}

// --- Folder group accordion ---
const collapsedFolderGroups = ref<Set<string>>(new Set())

function toggleFolderGroup(name: string) {
  const next = new Set(collapsedFolderGroups.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  collapsedFolderGroups.value = next
}

// --- Folder inline editing ---
const editingFolderId = ref<string | null>(null)
const editingFolderName = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)

const FOLDER_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16',
  '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6',
  '#ec4899', '#6b7280', null,
]

function startRenameFolder(folder: Label) {
  editingFolderId.value = folder.id
  editingFolderName.value = folder.name
  nextTick(() => renameInputRef.value?.focus())
}

async function saveRenameFolder(folder: Label) {
  const name = editingFolderName.value.trim()
  if (!name || name === folder.name) {
    editingFolderId.value = null
    return
  }
  try {
    await labelStore.updateLabel(folder.id, { name })
    toast.success(`Renamed to "${name}"`)
  } catch {
    toast.error('Could not rename folder')
  }
  editingFolderId.value = null
}

async function deleteFolder(folder: Label) {
  try {
    await labelStore.deleteLabel(folder.id)
    if (selectedFolderId.value === folder.id) {
      selectedFolderId.value = null
    }
    toast.success(`Deleted "${folder.name}"`)
  } catch {
    toast.error('Could not delete folder')
  }
}

async function changeFolderColor(folder: Label, color: string | null) {
  try {
    await labelStore.updateLabel(folder.id, { color })
    toast.success(`Updated "${folder.name}"`)
  } catch {
    toast.error('Could not update folder')
  }
}

async function createFolder() {
  const name = newFolderName.value.trim()
  if (!name) return
  creatingFolder.value = true
  try {
    const label = await labelStore.createLabel({ kind: 'document_category', name })
    newFolderName.value = ''
    selectedFolderId.value = label.id
    toast.success(`Folder "${name}" created`)
  } catch {
    toast.error('Could not create folder')
  } finally {
    creatingFolder.value = false
  }
}

// --- Sorting ---
type SortKey = 'uploaded' | 'updated' | 'name'
const sortKey = ref<SortKey>('uploaded')
const sortAsc = ref(false)

const sortOptions: { key: SortKey; label: string; icon: typeof ArrowDownAZIcon }[] = [
  { key: 'name', label: 'Name', icon: ArrowDownAZIcon },
  { key: 'uploaded', label: 'Uploaded', icon: CalendarArrowUpIcon },
  { key: 'updated', label: 'Updated', icon: ClockIcon },
]

function setSort(key: SortKey) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    sortAsc.value = key === 'name'
  }
}

// --- Documents ---
const documents = ref<Document[]>([])
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

function formatRelativeDate(value: string) {
  const now = Date.now()
  const then = new Date(value).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return formatDate(value)
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

function documentQuery() {
  const params = new URLSearchParams()
  if (selectedFolderId.value) {
    params.append('category_id[]', selectedFolderId.value)
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}

async function loadDocuments() {
  loading.value = true
  try {
    const [{ data }, allData] = await Promise.all([
      api<{ data: Document[] }>(`/documents${documentQuery()}`),
      // Always fetch all docs for sidebar counts
      selectedFolderId.value
        ? api<{ data: Document[] }>('/documents')
        : Promise.resolve(null),
    ])
    toastStatusChanges(data)
    documents.value = data
    if (allData) {
      allDocuments.value = allData.data
    } else {
      allDocuments.value = data
    }
  } catch {
    // keep the current list on transient errors
  } finally {
    loading.value = false
    schedulePolling()
  }
}

watch(selectedFolderId, () => {
  void loadDocuments()
})

function isSuggested(doc: Document) {
  return (doc.categories ?? []).some((category) => category.source === 'ai')
}

/**
 * Set the folder for a document (replaces, never merges — one folder per file).
 * Pass an empty array to unfile.
 */
async function setFolder(docId: string, folderId: string | null) {
  const doc = documents.value.find(d => d.id === docId)
  if (!doc) return

  const previous = doc.categories ?? []
  const labelIds = folderId ? [folderId] : []

  // Optimistic update
  doc.categories = folderId
    ? (labelStore.byId.get(folderId) ? [labelStore.byId.get(folderId)!] : [])
    : []

  try {
    const { data } = await api<{ data: Document }>(`/documents/${docId}`, {
      method: 'PATCH',
      body: { label_ids: labelIds },
    })
    doc.categories = data.categories
  } catch (err: any) {
    doc.categories = previous
    toast.error(err?.data?.message ?? 'Could not update folder')
  }
}

// --- Drag & drop filing ---
const dragDocId = ref<string | null>(null)
const dragOverFolderId = ref<string | null>(null)

function onDocDragStart(event: DragEvent, doc: Document) {
  dragDocId.value = doc.id
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', doc.id)
  }
}

function onDocDragEnd() {
  dragDocId.value = null
  dragOverFolderId.value = null
}

function onFolderDragOver(event: DragEvent, folderId: string) {
  if (!dragDocId.value) return
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  dragOverFolderId.value = folderId
}

function onFolderDragLeave(folderId: string) {
  if (dragOverFolderId.value === folderId) {
    dragOverFolderId.value = null
  }
}

async function onFolderDrop(event: DragEvent, folderId: string) {
  event.preventDefault()
  dragOverFolderId.value = null
  const docId = dragDocId.value
  dragDocId.value = null
  if (!docId) return

  const doc = documents.value.find(d => d.id === docId)
  if (!doc) return

  const currentFolderId = doc.categories?.[0]?.id ?? null
  if (currentFolderId === folderId) {
    toast.info('Already in this folder')
    return
  }

  await setFolder(docId, folderId)

  const folderName = labelStore.byId.get(folderId)?.name ?? 'folder'
  toast.success(`Moved "${doc.original_filename}" to ${folderName}`)
}

// --- Drag & drop folder reordering (own folders only) ---
const draggingFolderId = ref<string | null>(null)
const reorderOverFolderId = ref<string | null>(null)

function onFolderDragStart(event: DragEvent, folder: Label) {
  draggingFolderId.value = folder.id
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', folder.id)
  }
}

function onFolderDragEnd() {
  draggingFolderId.value = null
  reorderOverFolderId.value = null
}

function onFolderRowDragOver(event: DragEvent, folder: Label) {
  if (draggingFolderId.value) {
    if (draggingFolderId.value !== folder.id && folder.is_editable) {
      event.preventDefault()
      reorderOverFolderId.value = folder.id
    }
    return
  }
  onFolderDragOver(event, folder.id)
}

function onFolderRowDragLeave(folderId: string) {
  if (reorderOverFolderId.value === folderId) {
    reorderOverFolderId.value = null
  }
  onFolderDragLeave(folderId)
}

function onFolderRowDrop(event: DragEvent, folder: Label) {
  if (draggingFolderId.value) {
    void onFolderReorderDrop(event, folder)
    return
  }
  void onFolderDrop(event, folder.id)
}

async function onFolderReorderDrop(event: DragEvent, target: Label) {
  event.preventDefault()
  const draggedId = draggingFolderId.value
  draggingFolderId.value = null
  reorderOverFolderId.value = null
  if (!draggedId || draggedId === target.id) return
  await reorderFolders(draggedId, target.id)
}

async function reorderFolders(draggedId: string, targetId: string) {
  const mine = folderGroups.value.find((group) => group.name === 'My folders')
  if (!mine) return
  const ids = mine.labels.map((label) => label.id)
  const from = ids.indexOf(draggedId)
  const to = ids.indexOf(targetId)
  if (from === -1 || to === -1) return
  ids.splice(from, 1)
  ids.splice(to, 0, draggedId)

  // Optimistic update: keep the custom labels in their new order at the front
  // of the store so the sidebar reflects it immediately.
  const byId = new Map(labelStore.labels.map((label) => [label.id, label]))
  const mineLabels = ids.map((id) => byId.get(id)).filter((label): label is Label => label !== undefined)
  const others = labelStore.labels.filter((label) => !ids.includes(label.id))
  labelStore.labels = [...mineLabels, ...others]

  try {
    await api('/labels/reorder', { method: 'POST', body: { ordered_ids: ids } })
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not reorder folders')
    await labelStore.fetchLabels(true)
  }
}

const sortedDocuments = computed(() => {
  const list = [...documents.value]
  const dir = sortAsc.value ? 1 : -1
  list.sort((a, b) => {
    if (sortKey.value === 'name') {
      return dir * a.title.localeCompare(b.title)
    }
    if (sortKey.value === 'updated') {
      return dir * (new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }
    // uploaded (default)
    return dir * (new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  })
  return list
})

onMounted(() => {
  loadDocuments()
  void labelStore.fetchLabels()
  if (caseStore.cases.length === 0) void caseStore.fetchCases()
})

onBeforeUnmount(() => {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})

// --- Upload ---
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFiles = ref<File[]>([])
const uploading = ref(false)
const errorMessage = ref('')

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
  if (rejected.length > 0 && rejected[0]) {
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
      await api('/documents', { method: 'POST', body: form })
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

  if (failures.length > 0) errorMessage.value = failures[0] ?? 'Upload failed. Please try again.'
  if (!upgradeHit && selectedFiles.value.length === 0 && files.length > failures.length) {
    toast.success(`${files.length - failures.length} document${files.length - failures.length === 1 ? '' : 's'} uploaded`)
  }
  if (files.length > 0 && files.length === failures.length) {
    toast.error('All uploads failed')
  }

  uploading.value = false
  await loadDocuments()
}

// --- Actions ---
const viewing = ref<Document | null>(null)
const attachTarget = ref<Document | null>(null)
const attachCaseId = ref('')
const attaching = ref(false)
const retrying = ref<Set<string>>(new Set())
const tagOpen = ref(false)

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

// --- Bulk selection ---
const selectedDocIds = ref<Set<string>>(new Set())

const allSelected = computed(() => {
  if (sortedDocuments.value.length === 0) return false
  return sortedDocuments.value.every(d => selectedDocIds.value.has(d.id))
})

const someSelected = computed(() => selectedDocIds.value.size > 0)

function toggleSelectAll() {
  if (allSelected.value) {
    selectedDocIds.value = new Set()
  } else {
    selectedDocIds.value = new Set(sortedDocuments.value.map(d => d.id))
  }
}

function toggleSelectDoc(id: string) {
  const next = new Set(selectedDocIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  selectedDocIds.value = next
}

// --- Bulk folder move ---
const bulkFolderOpen = ref(false)
const bulkFolderRef = ref<HTMLElement | null>(null)

onClickOutside(bulkFolderRef, () => {
  bulkFolderOpen.value = false
})

async function bulkMoveToFolder(folderId: string) {
  if (selectedDocIds.value.size === 0) return

  const folderName = labelStore.byId.get(folderId)?.name ?? 'folder'
  const ids = [...selectedDocIds.value]
  let moved = 0

  for (const docId of ids) {
    const doc = documents.value.find(d => d.id === docId)
    if (!doc) continue
    const currentFolderId = doc.categories?.[0]?.id ?? null
    if (currentFolderId === folderId) continue
    await setFolder(docId, folderId)
    moved++
  }

  if (moved > 0) {
    toast.success(`Moved ${moved} file${moved === 1 ? '' : 's'} to ${folderName}`)
  } else {
    toast.info('All selected files are already in this folder')
  }

  selectedDocIds.value = new Set()
  bulkFolderOpen.value = false
}

// --- Bulk delete ---
const bulkDeleting = ref(false)

async function bulkDelete() {
  if (selectedDocIds.value.size === 0 || bulkDeleting.value) return
  const ids = [...selectedDocIds.value]
  bulkDeleting.value = true
  let deleted = 0

  for (const docId of ids) {
    try {
      await api(`/documents/${docId}`, { method: 'DELETE' })
      deleted++
    } catch {
      // continue
    }
  }

  if (deleted > 0) {
    toast.success(`Deleted ${deleted} file${deleted === 1 ? '' : 's'}`)
  }
  if (deleted < ids.length) {
    toast.error(`Could not delete ${ids.length - deleted} file${ids.length - deleted === 1 ? '' : 's'}`)
  }

  selectedDocIds.value = new Set()
  bulkDeleting.value = false
  await loadDocuments()
}
</script>

<template>
  <div class="flex h-full gap-6 p-6">
    <!-- Folder sidebar -->
    <aside class="hidden w-62 shrink-0 lg:block">
      <div class="sticky top-6 space-y-4">
        <!-- All Files -->
        <div class="surface p-3">
          <nav>
            <button
              type="button"
              class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors"
              :class="selectedFolderId === null ? 'bg-primary/10 font-medium text-primary' : 'text-foreground hover:bg-muted'"
              @click="selectFolder(null)"
            >
              <FolderOpenIcon class="size-4 shrink-0" />
              <span class="min-w-0 flex-1 truncate">All Files</span>
              <span class="tabular-nums text-[11px] text-muted-foreground">{{ allDocuments.length }}</span>
            </button>
          </nav>
        </div>

        <!-- Your Folders -->
        <div class="surface p-3">
          <div class="flex items-center justify-between px-2 pb-2">
            <h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your Folders</h2>
          </div>

          <nav class="space-y-3">
            <template v-if="folders.length > 0">
              <div v-for="group in folderGroups" :key="group.name">
                <button
                  type="button"
                  class="mb-1 flex w-full items-center gap-1 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  :aria-expanded="!collapsedFolderGroups.has(group.name)"
                  @click="toggleFolderGroup(group.name)"
                >
                  <ChevronRightIcon
                    class="size-3 shrink-0 transition-transform"
                    :class="collapsedFolderGroups.has(group.name) ? '' : 'rotate-90'"
                  />
                  <span class="min-w-0 flex-1 truncate text-left">{{ group.name }}</span>
                  <span class="shrink-0 tabular-nums opacity-60">{{ group.labels.length }}</span>
                </button>
                <div v-if="!collapsedFolderGroups.has(group.name)" class="space-y-0.5">
                  <div
                    v-for="folder in group.labels"
                    :key="folder.id"
                    class="group grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1.5"
                  >
                    <!-- Normal view -->
                    <button
                      v-if="editingFolderId !== folder.id"
                      type="button"
                      class="flex min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors"
                      :class="[
                        selectedFolderId === folder.id ? 'bg-primary/10 font-medium text-primary' : 'text-foreground hover:bg-muted',
                        dragOverFolderId === folder.id || reorderOverFolderId === folder.id ? 'ring-2 ring-primary bg-primary/5' : '',
                        draggingFolderId === folder.id ? 'opacity-40' : '',
                        folder.is_editable ? 'cursor-grab active:cursor-grabbing' : '',
                      ]"
                      :draggable="folder.is_editable"
                      :title="folder.is_editable ? 'Drag to reorder' : undefined"
                      @click="selectFolder(folder.id)"
                      @dblclick="folder.is_editable && startRenameFolder(folder)"
                      @dragstart="onFolderDragStart($event, folder)"
                      @dragend="onFolderDragEnd"
                      @dragover="onFolderRowDragOver($event, folder)"
                      @dragleave="onFolderRowDragLeave(folder.id)"
                      @drop="onFolderRowDrop($event, folder)"
                    >
                      <span
                        v-if="folder.color"
                        class="size-2.5 shrink-0 rounded-full"
                        :style="{ backgroundColor: folder.color }"
                      />
                      <FolderIcon v-else class="size-4 shrink-0" />
                      <span class="min-w-0 flex-1 truncate">{{ folder.name }}</span>
                    </button>

                    <!-- Inline rename -->
                    <div v-else class="flex min-w-0 items-center gap-2 px-2.5 py-1">
                      <span
                        v-if="folder.color"
                        class="size-2.5 shrink-0 rounded-full"
                        :style="{ backgroundColor: folder.color }"
                      />
                      <FolderIcon v-else class="size-4 shrink-0 text-muted-foreground" />
                      <input
                        ref="renameInputRef"
                        v-model="editingFolderName"
                        class="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        @keydown.enter.prevent="saveRenameFolder(folder)"
                        @keydown.escape="editingFolderId = null"
                        @blur="saveRenameFolder(folder)"
                      />
                    </div>

                    <span class="text-right text-[11px] tabular-nums text-muted-foreground">
                      {{ folderDocCounts.get(folder.id) ?? 0 }}
                    </span>

                    <!-- ... menu (own folders only) -->
                    <DropdownMenu v-if="editingFolderId !== folder.id && folder.is_editable">
                      <DropdownMenuTrigger as-child>
                        <button
                          type="button"
                          class="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                        >
                          <MoreHorizontalIcon class="size-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" class="w-44">
                        <DropdownMenuLabel class="text-[10px] uppercase tracking-wider text-muted-foreground">Color</DropdownMenuLabel>
                        <div class="flex flex-wrap gap-1 px-2 pb-2">
                          <button
                            v-for="swatch in FOLDER_COLORS"
                            :key="String(swatch)"
                            type="button"
                            class="size-6 shrink-0 rounded-full border-2 transition-transform hover:scale-110"
                            :class="folder.color === swatch ? 'border-foreground scale-110' : 'border-transparent'"
                            :style="{ backgroundColor: swatch ?? '#f3f4f6' }"
                            @click="changeFolderColor(folder, swatch)"
                          >
                            <span v-if="swatch === null" class="flex size-full items-center justify-center text-[10px] text-muted-foreground">✕</span>
                          </button>
                        </div>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem @click="startRenameFolder(folder)">
                          <PencilIcon class="size-3.5" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem class="text-destructive focus:text-destructive" @click="deleteFolder(folder)">
                          <Trash2Icon class="size-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            </template>

            <p v-else class="px-2.5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              No folders yet
            </p>
          </nav>
        </div>

        <!-- Create folder -->
        <div class="surface p-3">
          <p class="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            New folder
          </p>
          <div class="flex items-center gap-1.5">
            <Input
              v-model="newFolderName"
              class="h-8 flex-1 text-xs"
              placeholder="Folder name…"
              @keydown.enter.prevent="createFolder"
            />
            <Button
              variant="ghost"
              size="icon"
              class="size-8 shrink-0"
              :disabled="!newFolderName.trim() || creatingFolder"
              @click="createFolder"
            >
              <Loader2Icon v-if="creatingFolder" class="size-3.5 animate-spin" />
              <PlusIcon v-else class="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </aside>

    <!-- Main content -->
    <div class="min-w-0 flex-1">
      <AppPageHeader title="Files" description="Upload and organize your legal documents." :icon="FileUpIcon">
        <template #actions>
          <Button class="bg-brand-gradient shrink-0 gap-1.5 border-0 text-primary-foreground shadow-sm transition-opacity hover:opacity-90" @click="pickFile">
            <FileUpIcon class="size-4" />
            Upload
          </Button>
        </template>
      </AppPageHeader>

      <!-- Upload zone -->
      <div
        data-tour="documents-upload"
        class="surface-inset border-dashed p-5 transition-colors"
        :class="fileDrop.dragging.value ? 'border-primary bg-primary/5' : ''"
        @dragenter="fileDrop.onDragEnter"
        @dragover="fileDrop.onDragOver"
        @dragleave="fileDrop.onDragLeave"
        @drop="onFilesDropped"
      >
        <div class="flex flex-col items-center gap-2 text-center">
          <div class="flex size-10 items-center justify-center rounded-full bg-card shadow-sm">
            <FileUpIcon class="size-4 text-muted-foreground" />
          </div>
          <div>
            <p class="text-sm font-medium">PDF, DOCX, TXT, MD, or image — up to 25 MB</p>
            <p class="mt-0.5 text-xs text-muted-foreground">
              Drag and drop, or
              <button type="button" class="font-medium text-primary underline-offset-2 hover:underline" @click="pickFile">browse</button>
            </p>
          </div>
        </div>

        <div v-if="selectedFiles.length > 0" class="mt-3 space-y-1.5">
          <div
            v-for="(file, index) in selectedFiles"
            :key="`${file.name}-${index}`"
            class="flex items-center gap-3 rounded-lg bg-card p-2.5 text-sm shadow-sm"
          >
            <component :is="fileIcon(file.name, file.type)" class="size-4 shrink-0 text-muted-foreground" />
            <span class="min-w-0 flex-1 truncate">{{ file.name }}</span>
            <span class="shrink-0 text-xs text-muted-foreground">{{ formatBytes(file.size) }}</span>
            <Button variant="ghost" size="sm" :disabled="uploading" @click="removeSelected(index)">
              <XIcon class="size-3.5" />
            </Button>
          </div>
          <div class="flex justify-end">
            <Button :loading="uploading" size="sm" @click="upload">
              {{ uploading ? 'Uploading…' : `Upload ${selectedFiles.length}` }}
            </Button>
          </div>
        </div>

        <p v-if="errorMessage" class="mt-2 text-sm text-destructive">{{ errorMessage }}</p>
      </div>

      <input
        ref="fileInput"
        type="file"
        accept=".pdf,.docx,.txt,.md,.jpg,.jpeg,.png,.webp,.gif,.tiff,.heic"
        multiple
        class="hidden"
        @change="onFileSelected"
      />

      <!-- Toolbar: select all · count · sort -->
      <div class="mt-5 flex items-center justify-between gap-2">
        <div class="flex items-center gap-3">
          <span class="text-xs tabular-nums text-muted-foreground">
            {{ sortedDocuments.length }} file{{ sortedDocuments.length === 1 ? '' : 's' }}
          </span>
          <button
            v-if="sortedDocuments.length > 0"
            type="button"
            class="flex items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            @click="toggleSelectAll"
          >
            <span
              class="flex size-4 items-center justify-center rounded-[4px] border transition-colors"
              :class="allSelected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input hover:border-foreground/40'"
            >
              <CheckIcon v-if="allSelected" class="size-3" :stroke-width="3" />
              <span v-else-if="someSelected" class="size-1.5 rounded-[2px] bg-primary" />
            </span>
            Select all
          </button>
        </div>

        <div class="flex items-center gap-1 rounded-lg border p-0.5">
          <button
            v-for="opt in sortOptions"
            :key="opt.key"
            type="button"
            class="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
            :class="sortKey === opt.key ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'"
            @click="setSort(opt.key)"
          >
            <component :is="opt.icon" class="size-3.5" />
            {{ opt.label }}
            <ArrowUpDownIcon v-if="sortKey === opt.key" class="size-3" :class="sortAsc ? '' : 'rotate-180'" />
          </button>
        </div>
      </div>

      <!-- Bulk action bar -->
      <Transition
        enter-active-class="transition-all duration-150 ease-out"
        enter-from-class="opacity-0 -translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-all duration-100 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-1"
      >
        <div v-if="someSelected" class="surface mt-3 flex items-center gap-3 px-4 py-2.5">
          <span class="text-xs font-medium text-muted-foreground">
            {{ selectedDocIds.size }} selected
          </span>

          <!-- Move to folder -->
          <div ref="bulkFolderRef" class="relative">
            <Button variant="outline" size="sm" class="h-7 gap-1.5 px-2 text-xs" @click="bulkFolderOpen = !bulkFolderOpen">
              <FolderInputIcon class="size-3.5" />
              Move to folder
            </Button>
            <div
              v-if="bulkFolderOpen"
              class="absolute left-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border bg-popover shadow-lg"
            >
              <div class="max-h-48 overflow-y-auto p-1">
                <button
                  v-for="folder in folders"
                  :key="folder.id"
                  type="button"
                  class="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                  @click="bulkMoveToFolder(folder.id)"
                >
                  <span v-if="folder.color" class="size-2 shrink-0 rounded-full" :style="{ backgroundColor: folder.color }" />
                  <FolderIcon v-else class="size-3.5 shrink-0" />
                  <span class="min-w-0 flex-1 truncate">{{ folder.name }}</span>
                </button>
                <p v-if="folders.length === 0" class="px-2.5 py-2 text-xs text-muted-foreground">
                  No folders created yet.
                </p>
              </div>
            </div>
          </div>

          <!-- Delete -->
          <Button
            variant="outline"
            size="sm"
            class="h-7 gap-1.5 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
            :disabled="bulkDeleting"
            @click="bulkDelete"
          >
            <Loader2Icon v-if="bulkDeleting" class="size-3.5 animate-spin" />
            <TrashIcon v-else class="size-3.5" />
            Delete
          </Button>

          <button
            type="button"
            class="ml-auto text-xs text-muted-foreground underline-offset-2 hover:underline"
            @click="selectedDocIds = new Set()"
          >
            Clear selection
          </button>
        </div>
      </Transition>

      <!-- Document list -->
      <div class="mt-3 space-y-1.5">
        <ListSkeleton v-if="loading" :rows="3" />

        <EmptyState
          v-else-if="sortedDocuments.length === 0 && selectedFolderId"
          class="hero-gradient"
          :icon="FolderIcon"
          title="No files in this folder"
          description="Move files here or upload new ones."
        />

        <EmptyState
          v-else-if="sortedDocuments.length === 0"
          class="hero-gradient"
          :icon="FileIcon"
          title="No files yet"
          description="Upload your first file to get started."
        />

        <div
          v-for="(doc, i) in sortedDocuments"
          :key="doc.id"
          class="batayan-row-in group surface flex cursor-pointer items-center gap-3 px-4 py-3 transition-shadow"
          :style="{ '--row-delay': `${i * 30}ms` }"
          :class="[
            dragDocId === doc.id ? 'opacity-40' : '',
            selectedDocIds.has(doc.id) ? 'ring-1 ring-primary/30 bg-primary/5 shadow-sm' : 'hover:shadow-sm',
          ]"
          draggable="true"
          @click="viewing = doc"
          @dragstart="onDocDragStart($event, doc)"
          @dragend="onDocDragEnd"
        >
          <button
            type="button"
            class="flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors"
            :class="selectedDocIds.has(doc.id)
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input text-muted-foreground hover:border-foreground/40'"
            :aria-label="`Select ${doc.title}`"
            @click.stop="toggleSelectDoc(doc.id)"
          >
            <CheckIcon v-if="selectedDocIds.has(doc.id)" class="size-3" :stroke-width="3" />
          </button>
          <div class="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/70">
            <component :is="fileIcon(doc.original_filename, doc.mime_type)" class="size-4 text-muted-foreground" />
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
              <span> · {{ formatRelativeDate(doc.created_at) }}</span>
              <span v-if="uploaderLabel(doc)"> · {{ uploaderLabel(doc) }}</span>
            </p>
            <div v-if="doc.categories?.length" class="mt-1.5 flex flex-wrap gap-1">
              <span
                v-for="cat in doc.categories"
                :key="cat.id"
                class="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                <span v-if="cat.color" class="size-1.5 rounded-full" :style="{ backgroundColor: cat.color }" />
                {{ cat.name }}
              </span>
              <span
                v-if="isSuggested(doc)"
                class="inline-flex items-center gap-1 rounded-md bg-peach/40 px-1.5 py-0.5 text-[10px] text-espresso dark:bg-cream/10 dark:text-peach"
              >
                <SparklesIcon class="size-3" />
              </span>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-0.5" @click.stop>
            <DocumentActions
              :document="doc"
              :attaching="attachTarget?.id === doc.id"
              :retrying="retrying.has(doc.id)"
              @view="viewing = doc"
              @download="downloadDocument(doc.id, doc.original_filename)"
              @retry="retryDocument(doc)"
              @toggle-attach="toggleAttach(doc)"
              @toggle-file="tagOpen = true"
              @remove="removeDocument(doc)"
            />
          </div>
        </div>

        <!-- Attach panel -->
        <template v-for="doc in sortedDocuments" :key="`attach-${doc.id}`">
          <div v-if="attachTarget?.id === doc.id" class="surface overflow-hidden">
            <DocumentAttachPanel
              v-model="attachCaseId"
              :cases="cases"
              :busy="attaching"
              @attach="attachDocument"
              @cancel="attachTarget = null"
            />
          </div>
        </template>
      </div>
    </div>

    <FileTagDialog
      v-model:open="tagOpen"
      kind="document_category"
      hide-trigger
      :max="1"
      :files="documents"
      @update-file="(file, ids) => setFolder(file.id, ids[0] ?? null)"
    />

    <DocumentViewer v-if="viewing" :document="viewing" @close="viewing = null" />
  </div>
</template>
