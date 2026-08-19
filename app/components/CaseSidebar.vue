<script setup lang="ts">
import {
  ArrowUpRightIcon,
  CircleAlertIcon,
  DownloadIcon,
  FileIcon,
  FileSearchIcon,
  FileTextIcon,
  FileUpIcon,
  Loader2Icon,
  MessagesSquareIcon,
  MoreHorizontalIcon,
  PenLineIcon,
  PinIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  TagIcon,
  TrashIcon,
  XIcon,
} from '@lucide/vue'
import { type CaseConversation, type LegalCase } from '~/stores/cases'
import { useAuthStore } from '~/stores/auth'
import { useLabelStore } from '~/stores/labels'
import { DOCUMENT_STATUS_LABEL, type CaseDocument, type GeneratedDocument } from '~/types/case'
import LabelPicker from '~/components/LabelPicker.vue'
import FileTagDialog from '~/components/FileTagDialog.vue'
import CaseBrief from '~/components/CaseBrief.vue'
import CaseSidebarSection from '~/components/CaseSidebarSection.vue'
import CaseSidebarGroupHeader from '~/components/CaseSidebarGroupHeader.vue'
import { THREAD_ICONS, THREAD_TILES, threadPurposeKind } from '~/lib/threads'

/**
 * The case rail: everything the matter is made of, in separated sections.
 *
 * Identity — title, status, priority, deadline — used to be pinned at the top
 * of this rail, so the rail carried it, a calendar, and three material lists.
 * All of that identity has moved to the overview band at the top of the case
 * page, and the calendar now opens from that band's deadline strip. The rail is
 * left with what it is actually for: the work.
 *
 * Two shapes have already failed here. Stacking the three lists with fixed
 * height caps gave each one its own cramped scroll box, all competing for the
 * same eye. Putting them behind tabs fixed the cramping by hiding two thirds of
 * the rail — but the three lists are not peers. Threads are what this rail is
 * for; files are consulted; drafts are collected. Tabs charge the same price to
 * reach all three and make "which threads are open" and "did that upload land"
 * mutually exclusive questions.
 *
 * So: one scroller, four bands, sized by their contents rather than by a cap.
 * Only the section you are reading is expanded, the headers stick as you pass
 * them, and each band's primary action rides in its header instead of standing
 * below it as a full-width button.
 */
const props = withDefaults(defineProps<{
  threads: CaseConversation[]
  activeConversationId: string | null
  creating: boolean
  documents: CaseDocument[]
  documentsLoading: boolean
  documentsError: string
  uploading: boolean
  generated: GeneratedDocument[]
  generatedLoading: boolean
  /**
   * Threads whose answer is still being generated. A thread keeps working after
   * the user leaves it, so this rail is where they see it is still going — and
   * where they get back to it.
   */
  streamingThreadIds?: string[]
  /** Closed and archived cases keep their materials readable but add nothing. */
  readonly?: boolean
  /** The case record, whose facts anchor the Details section. */
  case: LegalCase
  /** Whether the case is still editable; gates the tag controls. */
  editable: boolean
}>(), { readonly: false, streamingThreadIds: () => [] })

const emit = defineEmits<{
  selectThread: [id: string]
  createThread: [purpose: string]
  upload: [files: File[]]
  rejectedUpload: [name: string]
  viewDocument: [doc: CaseDocument]
  downloadDocument: [doc: CaseDocument]
  deleteDocument: [doc: CaseDocument]
  retryDocument: [doc: CaseDocument]
  updateDocumentCategories: [doc: CaseDocument, ids: string[]]
  openGenerated: [doc: GeneratedDocument]
  updateThreadTags: [threadId: string, ids: string[]]
  togglePinThread: [threadId: string]
  updateTags: [tags: string[]]
}>()

const { formatShortDate, relativeTime } = useCasePresentation()
const { fileIcon } = useFileTypeIcon()
const auth = useAuthStore()
const labelStore = useLabelStore()

function isStreaming(id: string): boolean {
  return props.streamingThreadIds.includes(id)
}

function threadName(thread: CaseConversation) {
  return thread.purpose || thread.title || 'Untitled'
}

/* -------------------------------------------------------------------------
 * Filtering
 * ---------------------------------------------------------------------- */

const filter = ref('')
const needle = computed(() => filter.value.trim().toLowerCase())
const filtering = computed(() => needle.value.length > 0)

/**
 * A filter costs a permanent row, which a case with two threads and one file
 * should not pay. It appears once there is enough in the rail that scanning it
 * is the slower way — and the threshold reads the whole rail, not the filtered
 * result, so typing can never make the box that has focus disappear.
 */
const totalItems = computed(() => props.threads.length + props.documents.length + props.generated.length)
const showFilter = computed(() => totalItems.value > 8)

const visibleThreads = computed(() => (filtering.value
  ? props.threads.filter((thread) => threadName(thread).toLowerCase().includes(needle.value))
  : props.threads))

/** Pinned threads lead the list; within each rank the newest activity wins. */
const sortedThreads = computed(() =>
  [...visibleThreads.value].sort((a, b) => {
    const aPinned = a.pinned_at ? 0 : 1
    const bPinned = b.pinned_at ? 0 : 1
    if (aPinned !== bPinned) return aPinned - bPinned
    return new Date(b.last_message_at ?? b.created_at).getTime()
      - new Date(a.last_message_at ?? a.created_at).getTime()
  }),
)

const visibleDocuments = computed(() => (filtering.value
  ? props.documents.filter((doc) => `${doc.title} ${doc.original_filename}`.toLowerCase().includes(needle.value))
  : props.documents))

const visibleDrafts = computed(() => (filtering.value
  ? props.generated.filter((doc) => doc.title.toLowerCase().includes(needle.value))
  : props.generated))

/* -------------------------------------------------------------------------
 * Sections
 * ---------------------------------------------------------------------- */

type Section = 'details' | 'threads' | 'files' | 'drafts'

/** Threads and files open, because that is what the rail is usually for. */
const openSections = ref<Set<Section>>(new Set<Section>(['threads', 'files']))

/**
 * A filter that leaves its matches inside a collapsed band has not answered
 * anything, so searching opens every list. Details is not a list and keeps its
 * own state.
 */
function sectionOpen(key: Section) {
  if (filtering.value && key !== 'details') return true
  return openSections.value.has(key)
}

function toggleSection(key: Section) {
  const next = new Set(openSections.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  openSections.value = next
}

/** Used whenever something lands in a band the user is not currently looking at. */
function openSection(key: Section) {
  if (openSections.value.has(key)) return
  const next = new Set(openSections.value)
  next.add(key)
  openSections.value = next
}

/* -------------------------------------------------------------------------
 * Threads
 * ---------------------------------------------------------------------- */

const creatingThread = ref(false)
const newThreadPurpose = ref('')
const quickPurposes = ['Draft a letter', 'Legal research', 'Summarize facts']

function startThread() {
  creatingThread.value = !creatingThread.value
  if (creatingThread.value) openSection('threads')
}

function submitThread(purpose?: string) {
  const value = (purpose ?? newThreadPurpose.value).trim()
  if (!value || props.creating) return
  emit('createThread', value)
  newThreadPurpose.value = ''
  creatingThread.value = false
}

/**
 * The single line under a thread's name: how much work it holds and when it
 * was last touched. Message count and activity share the line so the list
 * reads as rows rather than cards.
 */
function threadMeta(thread: CaseConversation) {
  const parts: string[] = []
  if (thread.messages_count > 0) {
    parts.push(`${thread.messages_count} message${thread.messages_count === 1 ? '' : 's'}`)
  }
  if (thread.last_message_at) {
    parts.push(`last ${relativeTime(thread.last_message_at)}`)
  }
  return parts.length > 0 ? parts.join(' · ') : 'No messages yet'
}

/* -------------------------------------------------------------------------
 * Files
 * ---------------------------------------------------------------------- */

const fileInput = ref<HTMLInputElement | null>(null)
const drop = useFileDrop()
const selectedFiles = ref<File[]>([])

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Staged weight, so the size of what is about to be sent is known up front. */
const selectedBytes = computed(() => selectedFiles.value.reduce((total, file) => total + file.size, 0))

function pickFile() {
  openSection('files')
  fileInput.value?.click()
}

/**
 * A file's state is carried by the tile its type glyph sits in, not by a dot
 * on a separate line of text. Ingestion is a passing condition — most files
 * are simply ready — so the tile is quiet by default and only takes on colour
 * while a file is still being read or has failed, which is when the state is
 * the thing worth reading.
 */
const DOC_TILE: Record<CaseDocument['status'], string> = {
  queued: 'border-border bg-muted text-muted-foreground',
  processing: 'border-espresso/30 bg-espresso/10 text-espresso dark:border-peach/30 dark:bg-peach/10 dark:text-peach',
  ready: 'border-border bg-muted/60 text-muted-foreground group-hover:border-primary/30 group-hover:bg-primary/10 group-hover:text-primary',
  failed: 'border-destructive/30 bg-destructive/10 text-destructive',
}

/** Matching tone for the line of detail beneath the file's name. */
const DOC_TONE: Record<CaseDocument['status'], string> = {
  queued: 'text-muted-foreground',
  processing: 'font-medium text-espresso dark:text-peach',
  ready: 'text-muted-foreground',
  failed: 'font-medium text-destructive',
}

/**
 * The single line under a file's name. A ready file reports when it arrived
 * and how much of it Batayan can quote; anything else reports where it is in
 * the queue, because until it lands nothing else about it is actionable.
 */
function docMeta(doc: CaseDocument) {
  if (doc.status !== 'ready') return DOCUMENT_STATUS_LABEL[doc.status]

  const parts = [formatShortDate(doc.created_at)]
  if (doc.chunk_count > 0) {
    parts.push(`${doc.chunk_count} passage${doc.chunk_count === 1 ? '' : 's'}`)
  }
  // A shared shelf: say whose file it is, but only when it is not the
  // reader's own — every row naming you reads as noise.
  if (doc.uploaded_by && doc.user_id !== auth.user?.id) {
    parts.push(doc.uploaded_by)
  }

  return parts.join(' · ')
}

/** Files still being read; surfaces on the Files band's title as a badge. */
const pendingDocumentCount = computed(
  () => props.documents.filter((doc) => doc.status === 'queued' || doc.status === 'processing').length,
)

/**
 * The other groups a file also sits in. A document filed under three
 * categories is listed three times, and without this the copies are
 * indistinguishable — you cannot tell from any one of them that the file is
 * also filed elsewhere without opening the tag editor.
 */
function alsoFiledUnder(doc: CaseDocument, group: string) {
  return (doc.categories ?? []).filter((category) => category.id !== group)
}

function onFileSelected(event: Event) {
  const target = event.target as HTMLInputElement
  const picked = target.files ? Array.from(target.files) : []
  target.value = ''
  selectedFiles.value.push(...picked)
}

/**
 * The whole rail is the drop target, not just the files band — a file dragged
 * in while you are reading threads should still land, and the band opens to
 * meet it so the upload is visible rather than staged out of sight.
 */
function onFilesDropped(event: DragEvent) {
  if (props.readonly) return
  const rejected = drop.onDrop(event, (files) => {
    selectedFiles.value.push(...files)
  })
  openSection('files')
  if (rejected.length > 0) emit('rejectedUpload', rejected[0]?.name ?? 'That file')
}

function removeSelected(index: number) {
  selectedFiles.value.splice(index, 1)
}

function uploadSelected() {
  if (selectedFiles.value.length === 0 || props.uploading) return
  const files = [...selectedFiles.value]
  selectedFiles.value = []
  emit('upload', files)
}

function onDragEnter(event: DragEvent) {
  if (!props.readonly) drop.onDragEnter(event)
}

function onDragOver(event: DragEvent) {
  if (!props.readonly) drop.onDragOver(event)
}

function onDragLeave(event: DragEvent) {
  if (!props.readonly) drop.onDragLeave(event)
}

// Same reason: an upload failure is reported inside the files band, so open
// that band rather than leaving the message somewhere the user cannot see.
watch(
  () => props.documentsError,
  (message) => {
    if (message) openSection('files')
  },
)

/* -------------------------------------------------------------------------
 * Row chrome shared by all three lists
 * ---------------------------------------------------------------------- */

/**
 * The controls that act on one row — tagging, downloading, deleting — sit in
 * the row's own flow and hold their space whether or not they are showing.
 * They used to float over the row's right edge, which meant every list had to
 * pad its titles by a guessed amount to keep them from being covered, and on
 * touch, where there is no hover, they were pinned open on top of the filename
 * they belonged to.
 */
const ROW_ACTIONS = 'flex shrink-0 items-center gap-0.5 pr-1 opacity-0 pointer-events-none transition-opacity '
  + 'group-hover:opacity-100 group-hover:pointer-events-auto '
  + 'focus-within:opacity-100 focus-within:pointer-events-auto '
  + 'max-lg:opacity-100 max-lg:pointer-events-auto'

const ROW_ACTION_BUTTON = 'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground '
  + 'transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

/** The `+` and `↑` that ride in a section header. */
const SECTION_ACTION = 'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground '
  + 'transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 '
  + 'focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50'

/* -------------------------------------------------------------------------
 * Tag trees
 * ---------------------------------------------------------------------- */

/** A row in the files tree: either a tag group header or a document under it. */
type FileRow =
  | { type: 'header'; key: string; name: string; count: number; color: string | null }
  | { type: 'doc'; key: string; group: string; doc: CaseDocument }

/**
 * One filing dialog per sidebar, not per row. A row is keyed by its tag group,
 * so removing a file's last category moves it to "Unfiled" and remounts the
 * row — a dialog living inside it would close mid-edit. The dialog lives here
 * instead, and any row's tag button just opens it.
 */
const fileTagOpen = ref(false)

/** A row in the threads list: an accordion header or a thread card. */
type ThreadRow =
  | { type: 'header'; key: string; name: string; count: number }
  | { type: 'thread'; key: string; thread: CaseConversation }

/**
 * Kept apart per tree: a tag can name both a group of threads and a group of
 * files, and collapsing one is no statement about the other.
 */
const collapsedThreadGroups = ref<Set<string>>(new Set())
const collapsedFileGroups = ref<Set<string>>(new Set())

// Two entry points rather than one taking a ref: a ref reached from the
// template arrives already unwrapped, so it could not be written back through.
function toggleThreadGroup(key: string) {
  collapsedThreadGroups.value = flip(collapsedThreadGroups.value, key)
}

function toggleFileGroup(key: string) {
  collapsedFileGroups.value = flip(collapsedFileGroups.value, key)
}

function flip(set: Set<string>, key: string) {
  const next = new Set(set)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

/** A filter's matches must not stay hidden inside a collapsed tag group either. */
function groupCollapsed(set: Set<string>, key: string) {
  return !filtering.value && set.has(key)
}

/**
 * Drag & drop filing, mirroring the Files page: dragging a file row onto a
 * folder group header files it there, replacing any folder it already sits in
 * (never merging). Dropping onto "Unfiled" takes it back out.
 */
const dragDocId = ref<string | null>(null)
const dragOverFolderId = ref<string | null>(null)

function onDocDragStart(event: DragEvent, doc: CaseDocument) {
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
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dragOverFolderId.value = folderId
}

function onFolderDragLeave(folderId: string) {
  if (dragOverFolderId.value === folderId) dragOverFolderId.value = null
}

function onFolderDrop(event: DragEvent, folderId: string | null) {
  event.preventDefault()
  event.stopPropagation()
  dragOverFolderId.value = null
  const docId = dragDocId.value
  dragDocId.value = null
  if (!docId) return

  const doc = props.documents.find((d) => d.id === docId)
  if (!doc) return

  const currentFolderId = doc.categories?.[0]?.id ?? null
  if (currentFolderId === folderId) return

  // Replaces, never merges — one folder per file, like the Files page.
  emit('updateDocumentCategories', doc, folderId ? [folderId] : [])
}

/**
 * Tagged threads live under accordions keyed by their tags — one collapsible
 * group per tag, with a thread appearing in every group it carries. Threads
 * without tags fall under "Ungrouped", but only once something else has been
 * grouped: a heading over the whole list explains nothing.
 */
const threadRows = computed<ThreadRow[]>(() => {
  const rows: ThreadRow[] = []
  const byTagId = new Map<string, CaseConversation[]>()

  for (const thread of sortedThreads.value) {
    for (const tag of thread.tags ?? []) {
      const list = byTagId.get(tag.id) ?? []
      list.push(thread)
      byTagId.set(tag.id, list)
    }
  }

  const groups = [...byTagId.entries()]
    .map(([tagId, threads]) => ({
      key: tagId,
      name: labelStore.byId.get(tagId)?.name ?? 'Uncategorized',
      threads,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  for (const group of groups) {
    rows.push({ type: 'header', key: group.key, name: group.name, count: group.threads.length })
    if (!groupCollapsed(collapsedThreadGroups.value, group.key)) {
      for (const thread of group.threads) {
        rows.push({ type: 'thread', key: `t-${group.key}-${thread.id}`, thread })
      }
    }
  }

  const untagged = sortedThreads.value.filter((t) => (t.tags ?? []).length === 0)
  if (untagged.length === 0) return rows

  if (groups.length > 0) {
    rows.push({ type: 'header', key: 'ungrouped', name: 'Ungrouped', count: untagged.length })
    if (groupCollapsed(collapsedThreadGroups.value, 'ungrouped')) return rows
  }

  for (const thread of untagged) {
    rows.push({ type: 'thread', key: `tu-${thread.id}`, thread })
  }

  return rows
})

/**
 * The files view is a tree keyed by folder — one collapsible accordion per
 * folder, mirroring the thread tree above it. A folder header toggles its own
 * group; "All Files" and a header's drop target both keep working regardless
 * of which groups are folded.
 */
const fileRows = computed<FileRow[]>(() => {
  const rows: FileRow[] = []
  const byLabelId = new Map<string, CaseDocument[]>()

  for (const doc of visibleDocuments.value) {
    for (const category of doc.categories ?? []) {
      const list = byLabelId.get(category.id) ?? []
      list.push(doc)
      byLabelId.set(category.id, list)
    }
  }

  const groups = [...byLabelId.entries()]
    .map(([labelId, documents]) => ({
      key: labelId,
      name: labelStore.byId.get(labelId)?.name ?? 'Uncategorized',
      color: labelStore.byId.get(labelId)?.color ?? null,
      documents,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const unfiled = visibleDocuments.value.filter((doc) => (doc.categories ?? []).length === 0)

  const showDocs = (groupKey: string) => !groupCollapsed(collapsedFileGroups.value, groupKey)

  for (const group of groups) {
    rows.push({ type: 'header', key: group.key, name: group.name, color: group.color, count: group.documents.length })
    if (showDocs(group.key)) {
      for (const doc of group.documents) {
        rows.push({ type: 'doc', key: `d-${group.key}-${doc.id}`, group: group.key, doc })
      }
    }
  }

  if (unfiled.length > 0) {
    rows.push({ type: 'header', key: 'unfiled', name: 'Unfiled', count: unfiled.length })
    if (showDocs('unfiled')) {
      for (const doc of unfiled) {
        rows.push({ type: 'doc', key: `d-unfiled-${doc.id}`, group: 'unfiled', doc })
      }
    }
  }

  return rows
})

onMounted(() => {
  void labelStore.fetchLabels()
})
</script>

<template>
  <aside
    class="surface relative hidden h-full w-[21rem] shrink-0 flex-col overflow-hidden bg-sidebar md:flex"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onFilesDropped"
  >
    <div
      v-if="drop.dragging.value"
      class="pointer-events-none absolute inset-1 z-30 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10 text-sm font-medium text-primary"
    >
      Drop to attach
    </div>

    <div v-if="showFilter" class="shrink-0 border-b px-2.5 py-2">
      <div class="flex h-9 items-center gap-2 rounded-lg border bg-card px-2.5 focus-within:ring-2 focus-within:ring-ring/50">
        <SearchIcon class="size-4 shrink-0 text-muted-foreground" />
        <input
          v-model="filter"
          type="search"
          aria-label="Filter this case's threads, files and drafts"
          placeholder="Filter this case…"
          class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
          @keydown.esc="filter = ''"
        />
        <button
          v-if="filtering"
          type="button"
          aria-label="Clear filter"
          class="shrink-0 rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          @click="filter = ''"
        >
          <XIcon class="size-3.5" />
        </button>
      </div>
    </div>

    <!-- One scroller, four bands. -->
    <div class="min-h-0 flex-1 overflow-y-auto">
      <!-- Details -->
      <section v-if="!filtering">
        <CaseSidebarSection
          label="Details"
          :open="sectionOpen('details')"
          @toggle="toggleSection('details')"
        />
        <CaseBrief
          v-if="sectionOpen('details')"
          :case="props.case"
          :editable="props.editable"
          :collapsible="false"
          :show-identity="false"
          :hide-deadline="true"
          @update-tags="(tags) => emit('updateTags', tags)"
        />
      </section>

      <!-- Threads -->
      <section>
        <CaseSidebarSection
          label="Threads"
          :count="props.threads.length"
          count-label="threads"
          :open="sectionOpen('threads')"
          @toggle="toggleSection('threads')"
        >
          <template #action>
            <button
              v-if="!props.readonly"
              type="button"
              :class="SECTION_ACTION"
              :disabled="props.creating"
              aria-label="New thread"
              title="New thread"
              @click="startThread"
            >
              <PlusIcon class="size-4" />
            </button>
          </template>
        </CaseSidebarSection>

        <div v-if="sectionOpen('threads')" class="space-y-1 px-2 py-2">
          <div v-if="creatingThread && !props.readonly" class="mb-1.5 space-y-2.5 rounded-lg border bg-card p-2.5 shadow-sm">
            <Input
              v-model="newThreadPurpose"
              class="h-8 text-sm"
              placeholder="Purpose, e.g. Draft a letter"
              :disabled="props.creating"
              autofocus
              @keydown.enter="submitThread()"
              @keydown.esc="creatingThread = false"
            />
            <div class="flex flex-wrap gap-1">
              <Button
                v-for="purpose in quickPurposes"
                :key="purpose"
                variant="outline"
                size="xs"
                :disabled="props.creating"
                @click="submitThread(purpose)"
              >
                {{ purpose }}
              </Button>
            </div>
            <div class="flex items-center justify-end gap-1">
              <Button variant="ghost" size="xs" :disabled="props.creating" @click="creatingThread = false">
                Cancel
              </Button>
              <Button size="xs" :disabled="props.creating || !newThreadPurpose.trim()" @click="submitThread()">
                <Loader2Icon v-if="props.creating" class="size-3 animate-spin" />
                Create
              </Button>
            </div>
          </div>

          <p v-if="filtering && threadRows.length === 0" class="px-2 py-3 text-xs text-muted-foreground">
            No threads match “{{ filter.trim() }}”.
          </p>

          <div v-else-if="props.threads.length === 0" class="px-3 py-7 text-center">
            <MessagesSquareIcon class="mx-auto size-6 text-muted-foreground/50" />
            <p class="mt-2 text-xs font-medium">No threads yet</p>
            <p class="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Start one for each line of work on this case.
            </p>
            <Button v-if="!props.readonly" variant="outline" size="xs" class="mt-2.5" @click="startThread">
              <PlusIcon class="size-3.5" />
              New thread
            </Button>
          </div>

          <template v-for="row in threadRows" :key="row.key">
            <CaseSidebarGroupHeader
              v-if="row.type === 'header'"
              :name="row.name"
              :count="row.count"
              :collapsed="groupCollapsed(collapsedThreadGroups, row.key)"
              @click="toggleThreadGroup(row.key)"
            />

            <div
              v-else
              class="group relative flex items-center rounded-lg transition-colors"
              :class="row.thread.id === props.activeConversationId ? 'bg-primary/10' : 'hover:bg-muted'"
            >
              <span
                v-if="row.thread.id === props.activeConversationId"
                class="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary"
                aria-hidden="true"
              />
              <button
                class="flex min-w-0 flex-1 items-start gap-2.5 rounded-lg px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                @click="emit('selectThread', row.thread.id)"
              >
                <span
                  class="mt-px flex size-8 shrink-0 items-center justify-center rounded-lg"
                  :class="THREAD_TILES[threadPurposeKind(row.thread.purpose)]"
                >
                  <component :is="THREAD_ICONS[threadPurposeKind(row.thread.purpose)]" class="size-4" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex min-w-0 items-center gap-1">
                    <button
                      v-if="row.thread.pinned_at"
                      type="button"
                      class="-ml-0.5 inline-flex size-4 shrink-0 items-center justify-center text-primary transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      :aria-label="`Unpin ${threadName(row.thread)}`"
                      title="Unpin thread"
                      @click.stop="emit('togglePinThread', row.thread.id)"
                    >
                      <PinIcon class="size-3.5 -rotate-[15deg] fill-primary" />
                    </button>
                    <span
                      class="truncate text-sm leading-5"
                      :class="row.thread.id === props.activeConversationId ? 'font-medium text-primary' : 'text-foreground'"
                    >
                      {{ threadName(row.thread) }}
                    </span>
                  </span>
                  <span
                    v-if="isStreaming(row.thread.id)"
                    class="mt-0.5 flex items-center gap-1.5 truncate text-xs font-medium leading-4 text-primary"
                  >
                    <span class="relative flex size-1.5 shrink-0">
                      <span class="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
                      <span class="relative inline-flex size-1.5 rounded-full bg-primary" />
                    </span>
                    Batayan is replying…
                  </span>
                  <span v-else class="mt-0.5 block truncate text-xs leading-4 text-muted-foreground">
                    {{ threadMeta(row.thread) }}
                  </span>
                </span>
              </button>

              <div v-if="!props.readonly" :class="ROW_ACTIONS">
                <button
                  v-if="!row.thread.pinned_at"
                  type="button"
                  :class="ROW_ACTION_BUTTON"
                  :aria-label="`Pin ${threadName(row.thread)}`"
                  title="Pin thread"
                  @click="emit('togglePinThread', row.thread.id)"
                >
                  <PinIcon class="size-4 -rotate-[15deg]" />
                </button>
                <LabelPicker
                  kind="thread_tag"
                  trigger-label=""
                  :aria-label="`Tag ${threadName(row.thread)}`"
                  :trigger-class="`${ROW_ACTION_BUTTON} border-transparent bg-transparent p-0`"
                  :show-chips="false"
                  :max="10"
                  :model-value="(row.thread.tags ?? []).map((tag) => tag.id)"
                  @update:model-value="(ids) => emit('updateThreadTags', row.thread.id, ids)"
                />
              </div>
            </div>
          </template>
        </div>
      </section>

      <!-- Files -->
      <section>
        <CaseSidebarSection
          label="Files"
          :count="props.documents.length"
          count-label="files"
          :pending-count="pendingDocumentCount"
          :open="sectionOpen('files')"
          @toggle="toggleSection('files')"
        >
          <template #action>
            <button
              v-if="!props.readonly"
              type="button"
              :class="SECTION_ACTION"
              :disabled="props.uploading"
              aria-label="Add files to this case"
              title="Add files to this case"
              @click="pickFile"
            >
              <Loader2Icon v-if="props.uploading" class="size-4 animate-spin" />
              <FileUpIcon v-else class="size-4" />
            </button>
          </template>
        </CaseSidebarSection>

        <input
          ref="fileInput"
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md,.jpg,.jpeg,.png,.webp,.gif,.tiff,.heic"
          class="hidden"
          @change="onFileSelected"
        />

        <div v-if="sectionOpen('files')" class="space-y-1 px-2 py-2">
          <!-- Staged uploads wait here for a decision, so they lead the band. -->
          <div v-if="selectedFiles.length > 0" class="mb-1.5 space-y-1 rounded-lg border bg-card p-2">
            <div
              v-for="(file, index) in selectedFiles"
              :key="`${file.name}-${index}`"
              class="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60"
            >
              <component :is="fileIcon(file.name, file.type)" class="size-4 shrink-0 text-muted-foreground" />
              <span class="min-w-0 flex-1 truncate text-xs" :title="file.name">{{ file.name }}</span>
              <span class="shrink-0 text-xs tabular-nums text-muted-foreground">{{ formatBytes(file.size) }}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                class="shrink-0 text-muted-foreground hover:text-destructive"
                :disabled="props.uploading"
                :aria-label="`Remove ${file.name}`"
                @click="removeSelected(index)"
              >
                <XIcon />
              </Button>
            </div>
            <Button :loading="props.uploading" size="sm" class="mt-0.5 w-full" @click="uploadSelected">
              {{ props.uploading
                ? 'Uploading…'
                : `Upload ${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'} · ${formatBytes(selectedBytes)}` }}
            </Button>
          </div>

          <p
            v-if="props.documentsError"
            class="mb-1.5 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs leading-snug text-destructive"
          >
            <CircleAlertIcon class="mt-0.5 size-4 shrink-0" />
            <span>{{ props.documentsError }}</span>
          </p>

          <!-- The shape of a file row, so the list does not jump when it lands. -->
          <div v-if="props.documentsLoading && props.documents.length === 0" class="space-y-0.5">
            <div v-for="placeholder in 3" :key="placeholder" class="flex items-center gap-2.5 px-2 py-2">
              <Skeleton class="size-8 shrink-0 rounded-lg" />
              <div class="min-w-0 flex-1 space-y-1.5">
                <Skeleton class="h-3 w-3/4 rounded" />
                <Skeleton class="h-2 w-1/3 rounded" />
              </div>
            </div>
          </div>

          <p v-else-if="filtering && fileRows.length === 0" class="px-2 py-3 text-xs text-muted-foreground">
            No files match “{{ filter.trim() }}”.
          </p>

          <!--
            The dropzone is the empty state, not a permanent fixture. As a
            standing card it cost four rows at the top of the list forever, to
            explain something the header's upload button and the rail-wide drop
            target already do once you have any files at all.
          -->
          <div v-else-if="props.documents.length === 0" class="px-1 py-1">
            <button
              v-if="!props.readonly"
              type="button"
              class="group/drop flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed bg-muted/30 px-4 py-7 text-center transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              :class="drop.dragging.value ? 'border-primary bg-primary/5' : ''"
              @click="pickFile"
            >
              <span class="flex size-10 items-center justify-center rounded-xl border bg-card text-muted-foreground shadow-sm transition-colors group-hover/drop:border-primary/30 group-hover/drop:text-primary">
                <FileUpIcon class="size-5" />
              </span>
              <span class="mt-1 text-sm font-medium">Add files to this case</span>
              <span class="text-xs leading-relaxed text-muted-foreground">
                Drop them anywhere in this panel. Batayan can quote back whatever you attach.
              </span>
              <span class="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground/70">
                PDF · DOCX · TXT · MD · images
              </span>
            </button>
            <p v-else class="px-2 py-5 text-center text-xs text-muted-foreground">
              Nothing was attached to this case.
            </p>
          </div>

          <template v-for="row in fileRows" :key="row.key">
            <CaseSidebarGroupHeader
              v-if="row.type === 'header'"
              :name="row.name"
              :count="row.count"
              :color="row.color"
              :collapsed="groupCollapsed(collapsedFileGroups, row.key)"
              :class="[
                dragOverFolderId === row.key ? 'ring-1 ring-primary/60 bg-primary/5' : '',
              ]"
              @click="toggleFileGroup(row.key)"
              @dragover="onFolderDragOver($event, row.key)"
              @dragleave="onFolderDragLeave(row.key)"
              @drop="onFolderDrop($event, row.key === 'unfiled' ? null : row.key)"
            />

            <!--
              A file is a thing you open, so the row itself opens it and the
              things you do *to* it are held back until you reach for them.
            -->
            <div
              v-else
              draggable="true"
              class="group relative rounded-lg transition-colors"
              :class="[
                dragDocId === row.doc.id ? 'opacity-40' : '',
                row.doc.status === 'failed' ? 'bg-destructive/5 hover:bg-destructive/10' : 'hover:bg-muted',
              ]"
              @dragstart="onDocDragStart($event, row.doc)"
              @dragend="onDocDragEnd"
            >
              <div class="flex items-center">
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-start gap-2.5 rounded-lg px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  :title="row.doc.original_filename"
                  @click="emit('viewDocument', row.doc)"
                >
                  <span
                    class="mt-px flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors"
                    :class="DOC_TILE[row.doc.status]"
                  >
                    <Loader2Icon v-if="row.doc.status === 'processing'" class="size-4 animate-spin" />
                    <component
                      :is="fileIcon(row.doc.original_filename, row.doc.mime_type)"
                      v-else
                      class="size-4"
                    />
                  </span>

                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm leading-5">{{ row.doc.title }}</span>
                    <span class="mt-0.5 flex items-center gap-1 overflow-hidden">
                      <span :class="['min-w-0 truncate text-xs leading-4', DOC_TONE[row.doc.status]]">
                        {{ docMeta(row.doc) }}
                      </span>
                      <span
                        v-for="category in alsoFiledUnder(row.doc, row.group)"
                        :key="category.id"
                        class="flex max-w-[4.5rem] shrink-0 items-center gap-1 truncate rounded bg-muted px-1.5 text-[11px] leading-4 text-muted-foreground"
                        :title="`Also in ${category.name}`"
                      >
                        <span
                          class="size-1.5 shrink-0 rounded-full"
                          :class="category.color ? '' : 'bg-muted-foreground/40'"
                          :style="category.color ? { backgroundColor: category.color } : undefined"
                          aria-hidden="true"
                        />
                        {{ category.name }}
                      </span>
                    </span>
                  </span>
                </button>

                <!--
                  Download and delete share one menu rather than each taking a
                  slot: three permanent affordances per row is what pushed the
                  old toolbar over the filename in the first place.
                -->
                <div :class="ROW_ACTIONS">
                  <button
                    v-if="!props.readonly"
                    type="button"
                    :class="ROW_ACTION_BUTTON"
                    :aria-label="`Tag ${row.doc.title}`"
                    title="File under a folder"
                    @click="fileTagOpen = true"
                  >
                    <TagIcon class="size-4" />
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger :class="ROW_ACTION_BUTTON" :aria-label="`Actions for ${row.doc.title}`">
                      <MoreHorizontalIcon class="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" class="w-40">
                      <DropdownMenuItem
                        v-if="row.doc.status === 'failed'"
                        @click="emit('retryDocument', row.doc)"
                      >
                        <RotateCcwIcon class="size-4" />
                        Retry
                      </DropdownMenuItem>
                      <DropdownMenuItem v-else @click="emit('downloadDocument', row.doc)">
                        <DownloadIcon class="size-4" />
                        Download
                      </DropdownMenuItem>
                      <template v-if="!props.readonly && row.doc.status !== 'failed'">
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" @click="emit('deleteDocument', row.doc)">
                          <TrashIcon class="size-4" />
                          Delete
                        </DropdownMenuItem>
                      </template>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <p
                v-if="row.doc.status === 'failed' && row.doc.error_message"
                class="px-2 pb-2 pl-[3.25rem] text-xs leading-snug text-destructive"
              >
                {{ row.doc.error_message }}
              </p>

              <!--
                Ingestion has no percentage to report, so the row carries an
                indeterminate rule rather than a spinner competing with the one
                already standing in for the file's glyph.
              -->
              <span
                v-if="row.doc.status === 'queued' || row.doc.status === 'processing'"
                class="pointer-events-none absolute inset-x-2 bottom-0.5 h-0.5 overflow-hidden rounded-full bg-border"
                aria-hidden="true"
              >
                <span class="doc-progress block h-full w-1/3 rounded-full bg-espresso dark:bg-peach" />
              </span>
            </div>
          </template>
        </div>
      </section>

      <!-- Drafts -->
      <section>
        <CaseSidebarSection
          label="Drafts"
          :count="props.generated.length"
          count-label="drafts"
          :open="sectionOpen('drafts')"
          @toggle="toggleSection('drafts')"
        >
          <template #action>
            <NuxtLink
              to="/drafts"
              :class="SECTION_ACTION"
              aria-label="All drafts"
              title="All drafts"
            >
              <ArrowUpRightIcon class="size-4" />
            </NuxtLink>
          </template>
        </CaseSidebarSection>

        <div v-if="sectionOpen('drafts')" class="space-y-1 px-2 py-2">
          <div v-if="props.generatedLoading && props.generated.length === 0" class="space-y-0.5">
            <div v-for="placeholder in 2" :key="placeholder" class="flex items-center gap-2.5 px-2 py-2">
              <Skeleton class="size-8 shrink-0 rounded-lg" />
              <div class="min-w-0 flex-1 space-y-1.5">
                <Skeleton class="h-3 w-3/4 rounded" />
                <Skeleton class="h-2 w-1/3 rounded" />
              </div>
            </div>
          </div>

          <p v-else-if="filtering && visibleDrafts.length === 0" class="px-2 py-3 text-xs text-muted-foreground">
            No drafts match “{{ filter.trim() }}”.
          </p>

          <p v-else-if="props.generated.length === 0" class="px-2 py-3 text-xs leading-relaxed text-muted-foreground">
            Nothing drafted yet. Ask Batayan for a letter, then edit and export it from the letter editor.
          </p>

          <!--
            Same row grammar as threads and files — tile, name, one line of
            detail, actions on reach. Each draft used to carry two full "Word"
            and "PDF" buttons, which made a list of three drafts louder than a
            list of thirty files. Export lives inside the letter editor now, so
            the row just reopens it.
          -->
          <div
            v-for="doc in visibleDrafts"
            :key="doc.id"
            class="group flex items-center rounded-lg transition-colors hover:bg-muted"
          >
            <div class="flex min-w-0 flex-1 items-start gap-2.5 px-2 py-2">
              <span class="mt-px flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/60 text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:bg-primary/10 group-hover:text-primary">
                <FileTextIcon class="size-4" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm leading-5" :title="doc.title">{{ doc.title }}</span>
                <span class="mt-0.5 block truncate text-xs leading-4 text-muted-foreground">
                  {{ formatShortDate(doc.created_at) }}
                </span>
              </span>
            </div>

            <div :class="ROW_ACTIONS">
              <button
                type="button"
                :class="ROW_ACTION_BUTTON"
                :aria-label="`Request vetting and notarization for ${doc.title}`"
                title="Request vetting & notarization"
                @click="navigateTo(`/vetting/new?draft=${encodeURIComponent(doc.id)}`)"
              >
                <FileSearchIcon class="size-4" />
              </button>
              <button
                type="button"
                :class="ROW_ACTION_BUTTON"
                :aria-label="`Edit ${doc.title} in the letter editor`"
                title="Edit in the letter editor"
                @click="emit('openGenerated', doc)"
              >
                <PenLineIcon class="size-4" />
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </aside>

  <FileTagDialog
    v-if="!props.readonly"
    v-model:open="fileTagOpen"
    kind="document_category"
    hide-trigger
    :max="1"
    :files="props.documents"
    @update-file="(file, ids) => emit('updateDocumentCategories', file, ids)"
  />
</template>

<style scoped>
/* The travelling rule under a file that is still being read. */
@keyframes doc-progress {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(320%); }
}

.doc-progress {
  animation: doc-progress 1.6s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .doc-progress {
    width: 100%;
    opacity: 0.5;
    animation: none;
  }
}
</style>
