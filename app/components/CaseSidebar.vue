<script setup lang="ts">
import type { Component } from 'vue'
import {
  ChevronDownIcon,
  CircleAlertIcon,
  DownloadIcon,
  FileIcon,
  FileTextIcon,
  FileUpIcon,
  Loader2Icon,
  MessagesSquareIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from '@lucide/vue'
import type { CaseConversation } from '~/stores/cases'
import { useLabelStore } from '~/stores/labels'
import { DOCUMENT_STATUS_LABEL, type CaseDocument, type GeneratedDocument } from '~/types/case'
import LabelPicker from '~/components/LabelPicker.vue'
import { THREAD_ICONS, THREAD_TILES, threadPurposeKind } from '~/lib/threads'

/**
 * The case's working materials, one list at a time.
 *
 * These three lists used to be stacked in a single column with hard caps —
 * threads at 35dvh, drafts at 22dvh, files taking whatever remained — so each
 * one was a cramped scroll box, all three competed for the same eye, and on a
 * short laptop screen every one of them showed about two rows. Tabs give
 * whichever list you are actually using the full height of the rail.
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
  exporting: string | null
  /** Closed and archived cases keep their materials readable but add nothing. */
  readonly?: boolean
}>(), { readonly: false })

const emit = defineEmits<{
  selectThread: [id: string]
  createThread: [purpose: string]
  upload: [files: File[]]
  rejectedUpload: [name: string]
  viewDocument: [doc: CaseDocument]
  downloadDocument: [doc: CaseDocument]
  deleteDocument: [doc: CaseDocument]
  updateDocumentCategories: [doc: CaseDocument, ids: string[]]
  downloadGenerated: [doc: GeneratedDocument, type: 'word' | 'pdf']
  updateThreadTags: [threadId: string, ids: string[]]
}>()

const { formatShortDate, relativeTime } = useCasePresentation()
// The tab keeps the generic glyph — it labels the list, not any one file.
const { fileIcon } = useFileTypeIcon()
const labelStore = useLabelStore()

type Tab = 'threads' | 'files' | 'drafts'

const tab = ref<Tab>('threads')

const tabs = computed<Array<{ key: Tab; label: string; icon: Component; count: number }>>(() => [
  { key: 'threads', label: 'Threads', icon: MessagesSquareIcon, count: props.threads.length },
  { key: 'files', label: 'Files', icon: FileIcon, count: props.documents.length },
  { key: 'drafts', label: 'Drafts', icon: FileTextIcon, count: props.generated.length },
])

const creatingThread = ref(false)
const newThreadPurpose = ref('')
const quickPurposes = ['Draft a letter', 'Legal research', 'Summarize facts']

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

  return parts.join(' · ')
}

/**
 * The other groups a file also sits in. A document filed under three
 * categories is listed three times, and without this the copies are
 * indistinguishable — you cannot tell from any one of them that the file is
 * also filed elsewhere without opening the tag editor.
 */
function alsoFiledUnder(doc: CaseDocument, group: string) {
  return (doc.categories ?? []).filter((category) => category.id !== group)
}

function submitThread(purpose?: string) {
  const value = (purpose ?? newThreadPurpose.value).trim()
  if (!value || props.creating) return
  emit('createThread', value)
  newThreadPurpose.value = ''
  creatingThread.value = false
}

function onFileSelected(event: Event) {
  const target = event.target as HTMLInputElement
  const picked = target.files ? Array.from(target.files) : []
  target.value = ''
  selectedFiles.value.push(...picked)
}

/**
 * The whole rail is the drop target, not just the Files tab — a file dragged
 * in while you are reading threads should still land, and the tab follows it
 * so the upload is visible rather than silently queued behind another tab.
 */
function onFilesDropped(event: DragEvent) {
  if (props.readonly) return
  const rejected = drop.onDrop(event, (files) => {
    selectedFiles.value.push(...files)
  })
  tab.value = 'files'
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

// Same reason: an upload failure is reported inside the Files tab, so surface
// that tab rather than leaving the message somewhere the user cannot see.
watch(
  () => props.documentsError,
  (message) => {
    if (message) tab.value = 'files'
  },
)

onMounted(() => {
  void labelStore.fetchLabels()
})

/** A row in the files tree: either a tag group header or a document under it. */
type FileRow =
  | { type: 'header'; key: string; name: string; count: number }
  | { type: 'doc'; key: string; group: string; doc: CaseDocument }

/** A row in the threads list: an accordion header or a thread card. */
type ThreadRow =
  | { type: 'header'; key: string; name: string; count: number }
  | { type: 'thread'; key: string; thread: CaseConversation }

const collapsedGroups = ref<Set<string>>(new Set())

/**
 * Tagged threads live under accordions keyed by their tags — one collapsible
 * group per tag, with a thread appearing in every group it carries. Threads
 * without tags sit directly in the list. This mirrors the files tree.
 */
const threadRows = computed<ThreadRow[]>(() => {
  const rows: ThreadRow[] = []
  const byTagId = new Map<string, CaseConversation[]>()

  for (const thread of props.threads) {
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
    if (!collapsedGroups.value.has(group.key)) {
      for (const thread of group.threads) {
        rows.push({ type: 'thread', key: `t-${group.key}-${thread.id}`, thread })
      }
    }
  }

  for (const thread of props.threads.filter((t) => (t.tags ?? []).length === 0)) {
    rows.push({ type: 'thread', key: `tu-${thread.id}`, thread })
  }

  return rows
})

/**
 * The files view is a tree keyed by category: each tag the documents carry
 * becomes a collapsible group, and anything without a tag falls under
 * "Unfiled". A document filed under several tags appears in each of its groups.
 */
const fileRows = computed<FileRow[]>(() => {
  const rows: FileRow[] = []
  const byLabelId = new Map<string, CaseDocument[]>()

  for (const doc of props.documents) {
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
      documents,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  for (const group of groups) {
    rows.push({ type: 'header', key: group.key, name: group.name, count: group.documents.length })
    if (!collapsedGroups.value.has(group.key)) {
      for (const doc of group.documents) {
        rows.push({ type: 'doc', key: `d-${group.key}-${doc.id}`, group: group.key, doc })
      }
    }
  }

  const unfiled = props.documents.filter((doc) => (doc.categories ?? []).length === 0)
  if (unfiled.length > 0) {
    rows.push({ type: 'header', key: 'unfiled', name: 'Unfiled', count: unfiled.length })
    if (!collapsedGroups.value.has('unfiled')) {
      for (const doc of unfiled) {
        rows.push({ type: 'doc', key: `d-unfiled-${doc.id}`, group: 'unfiled', doc })
      }
    }
  }

  return rows
})

function toggleGroup(key: string) {
  const next = new Set(collapsedGroups.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  collapsedGroups.value = next
}
</script>

<template>
  <aside
    class="relative hidden w-64 shrink-0 flex-col overflow-hidden border-r bg-sidebar md:flex"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onFilesDropped"
  >
    <div
      v-if="drop.dragging.value"
      class="pointer-events-none absolute inset-1 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10 text-sm font-medium text-primary"
    >
      Drop to attach
    </div>

    <div class="flex shrink-0 items-center gap-0.5 border-b p-1.5" role="tablist" aria-label="Case materials">
      <button
        v-for="entry in tabs"
        :key="entry.key"
        type="button"
        role="tab"
        :aria-selected="tab === entry.key"
        class="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md px-1.5 text-xs font-medium transition-colors"
        :class="tab === entry.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
        @click="tab = entry.key"
      >
        <component :is="entry.icon" class="size-3.5 shrink-0" />
        <span class="truncate">{{ entry.label }}</span>
        <span v-if="entry.count > 0" class="tabular-nums opacity-60">{{ entry.count }}</span>
      </button>
    </div>

    <!-- Threads -->
    <template v-if="tab === 'threads'">
      <div class="shrink-0 px-2 pt-2">
        <Button
          v-if="!props.readonly"
          variant="outline"
          size="sm"
          class="w-full justify-start gap-1.5"
          :disabled="props.creating"
          @click="creatingThread = !creatingThread"
        >
          <PlusIcon class="size-3.5" />
          New thread
        </Button>

        <div v-if="creatingThread && !props.readonly" class="mt-2 space-y-2 rounded-lg border bg-background p-2 shadow-sm">
          <Input
            v-model="newThreadPurpose"
            class="h-8 text-sm"
            placeholder="Purpose, e.g. Draft a letter"
            :disabled="props.creating"
            @keydown.enter="submitThread()"
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
      </div>

      <nav class="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        <p v-if="props.threads.length === 0" class="rounded-xl border border-dashed px-3 py-6 text-center text-xs leading-relaxed text-muted-foreground">
          No threads yet. Start one for each line of work on this case.
        </p>
        <template v-for="row in threadRows" :key="row.key">
          <button
            v-if="row.type === 'header'"
            type="button"
            class="flex w-full items-center gap-1 rounded-md px-1 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            @click="toggleGroup(row.key)"
          >
            <ChevronDownIcon
              class="size-3 shrink-0 transition-transform"
              :class="collapsedGroups.has(row.key) ? '-rotate-90' : ''"
            />
            <span class="min-w-0 flex-1 truncate text-left">{{ row.name }}</span>
            <span class="shrink-0 tabular-nums opacity-60">{{ row.count }}</span>
          </button>

          <div
            v-else
            class="group relative rounded-xl border transition-colors"
            :class="row.thread.id === props.activeConversationId
              ? 'border-primary/30 bg-primary/10'
              : 'border-border/60 bg-background/60 hover:border-primary/30 hover:bg-muted/60'"
          >
            <span
              v-if="row.thread.id === props.activeConversationId"
              class="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary"
              aria-hidden="true"
            />
            <button
              class="flex w-full items-start gap-2.5 px-3 pb-1 pt-2.5 text-left"
              @click="emit('selectThread', row.thread.id)"
            >
              <span
                class="flex size-8 shrink-0 items-center justify-center rounded-lg"
                :class="THREAD_TILES[threadPurposeKind(row.thread.purpose)]"
              >
                <component :is="THREAD_ICONS[threadPurposeKind(row.thread.purpose)]" class="size-4" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-2">
                  <span
                    class="min-w-0 flex-1 truncate text-[13px] font-medium"
                    :class="row.thread.id === props.activeConversationId ? 'text-primary' : 'text-foreground'"
                  >
                    {{ row.thread.purpose || row.thread.title || 'Untitled' }}
                  </span>
                </span>
                <span class="mt-0.5 block text-[11px] text-muted-foreground">
                  {{ row.thread.last_message_at ? `Last activity ${relativeTime(row.thread.last_message_at)}` : 'No messages yet' }}
                </span>
              </span>
              <span
                v-if="row.thread.messages_count > 0"
                class="mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums"
                :class="row.thread.id === props.activeConversationId ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'"
              >
                {{ row.thread.messages_count }}
              </span>
            </button>
            <div class="px-3 pb-2">
              <LabelPicker
                class="mt-0.5"
                kind="thread_tag"
                trigger-label="Tag"
                :max="10"
                :disabled="props.readonly"
                :model-value="(row.thread.tags ?? []).map((tag) => tag.id)"
                @update:model-value="(ids) => emit('updateThreadTags', row.thread.id, ids)"
              />
            </div>
          </div>
        </template>
      </nav>
    </template>

    <!-- Files -->
    <template v-else-if="tab === 'files'">
      <div v-if="!props.readonly" class="shrink-0 space-y-2 px-2 pt-2">
        <!--
          The whole card is the button. The old panel spelled the invitation
          out over three centred lines but hung the only click target on the
          words "choose them", so the largest thing on screen did nothing and
          the smallest thing did the work.
        -->
        <button
          type="button"
          class="group/drop flex w-full items-center gap-2.5 rounded-lg border border-dashed bg-muted/30 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          :class="drop.dragging.value ? 'border-primary bg-primary/5' : ''"
          @click="pickFile"
        >
          <span class="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground shadow-sm transition-colors group-hover/drop:border-primary/30 group-hover/drop:text-primary">
            <FileUpIcon class="size-4" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-xs font-medium">Add files to this case</span>
            <span class="block truncate text-[11px] text-muted-foreground">
              Drop them here · PDF, DOCX, TXT, MD, images
            </span>
          </span>
        </button>

        <input
          ref="fileInput"
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md,.jpg,.jpeg,.png,.webp,.gif,.tiff,.heic"
          class="hidden"
          @change="onFileSelected"
        />

        <div v-if="selectedFiles.length > 0" class="space-y-1 rounded-lg border bg-background p-1.5">
          <div
            v-for="(file, index) in selectedFiles"
            :key="`${file.name}-${index}`"
            class="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-muted/60"
          >
            <component :is="fileIcon(file.name, file.type)" class="size-3.5 shrink-0 text-muted-foreground" />
            <span class="min-w-0 flex-1 truncate text-xs" :title="file.name">{{ file.name }}</span>
            <span class="shrink-0 text-[11px] tabular-nums text-muted-foreground">{{ formatBytes(file.size) }}</span>
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

        <!--
          Staged files are handed off and cleared the moment the upload starts,
          so without this the panel went blank and the only sign of work was a
          row appearing some seconds later.
        -->
        <div
          v-else-if="props.uploading"
          class="flex items-center gap-2 rounded-lg border bg-background px-2 py-1.5 text-xs text-muted-foreground"
        >
          <Loader2Icon class="size-3.5 shrink-0 animate-spin" />
          Uploading…
        </div>

        <p
          v-if="props.documentsError"
          class="flex items-start gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[11px] leading-snug text-destructive"
        >
          <CircleAlertIcon class="mt-px size-3.5 shrink-0" />
          <span>{{ props.documentsError }}</span>
        </p>
      </div>

      <div class="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        <!-- The shape of a file row, so the list does not jump when it lands. -->
        <div
          v-if="props.documentsLoading && props.documents.length === 0"
          class="space-y-0.5"
        >
          <div v-for="placeholder in 3" :key="placeholder" class="flex items-center gap-2 px-2 py-1.5">
            <Skeleton class="size-7 shrink-0 rounded-md" />
            <div class="min-w-0 flex-1 space-y-1.5">
              <Skeleton class="h-3 w-3/4 rounded" />
              <Skeleton class="h-2 w-1/3 rounded" />
            </div>
          </div>
        </div>

        <div v-else-if="props.documents.length === 0" class="px-3 py-6 text-center">
          <FileIcon class="mx-auto size-5 text-muted-foreground/50" />
          <p class="mt-2 text-xs font-medium">No files yet</p>
          <p class="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {{ props.readonly
              ? 'Nothing was attached to this case.'
              : 'Whatever you attach stays with this case, and Batayan can quote it back to you.' }}
          </p>
        </div>

        <template v-for="row in fileRows" :key="row.key">
          <button
            v-if="row.type === 'header'"
            type="button"
            class="flex w-full items-center gap-1 rounded-md px-1 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            @click="toggleGroup(row.key)"
          >
            <ChevronDownIcon
              class="size-3 shrink-0 transition-transform"
              :class="collapsedGroups.has(row.key) ? '-rotate-90' : ''"
            />
            <span class="min-w-0 flex-1 truncate text-left">{{ row.name }}</span>
            <span class="shrink-0 tabular-nums opacity-60">{{ row.count }}</span>
          </button>

          <!--
            A file is a thing you open, so the row itself opens it and the
            things you do *to* it are held back until you reach for them. The
            row used to be a bordered card whose only click targets were three
            icons and a dashed "Tag" pill — four permanent controls per file,
            in a 16rem rail, competing with the filename they belonged to.
          -->
          <div
            v-else
            class="group relative rounded-lg transition-colors"
            :class="row.doc.status === 'failed' ? 'bg-destructive/5 hover:bg-destructive/10' : 'hover:bg-muted'"
          >
            <button
              type="button"
              class="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              :title="row.doc.original_filename"
              @click="emit('viewDocument', row.doc)"
            >
              <span
                class="mt-px flex size-7 shrink-0 items-center justify-center rounded-md border transition-colors"
                :class="DOC_TILE[row.doc.status]"
              >
                <Loader2Icon v-if="row.doc.status === 'processing'" class="size-3.5 animate-spin" />
                <component
                  :is="fileIcon(row.doc.original_filename, row.doc.mime_type)"
                  v-else
                  class="size-3.5"
                />
              </span>

              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm leading-5 max-lg:pr-[5.5rem]">{{ row.doc.title }}</span>
                <span class="mt-0.5 flex items-center gap-1 overflow-hidden">
                  <span class="min-w-0 truncate text-[11px] leading-4" :class="DOC_TONE[row.doc.status]">
                    {{ docMeta(row.doc) }}
                  </span>
                  <span
                    v-for="category in alsoFiledUnder(row.doc, row.group)"
                    :key="category.id"
                    class="max-w-[4.5rem] shrink-0 truncate rounded bg-muted px-1 text-[10px] leading-4 text-muted-foreground"
                    :title="`Also filed under ${category.name}`"
                  >
                    {{ category.name }}
                  </span>
                </span>
              </span>
            </button>

            <div
              class="absolute right-1 top-1 flex items-center gap-0.5 rounded-md border bg-background/95 p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-lg:opacity-100"
            >
              <LabelPicker
                v-if="!props.readonly"
                kind="document_category"
                trigger-label=""
                :aria-label="`Tag ${row.doc.title}`"
                trigger-class="size-6 justify-center rounded-md border-transparent p-0 hover:bg-muted hover:text-foreground"
                :show-chips="false"
                :max="5"
                :model-value="(row.doc.categories ?? []).map((category) => category.id)"
                @update:model-value="(ids) => emit('updateDocumentCategories', row.doc, ids)"
              />
              <Button
                variant="ghost"
                size="icon-xs"
                class="text-muted-foreground hover:text-foreground"
                :aria-label="`Download ${row.doc.title}`"
                @click="emit('downloadDocument', row.doc)"
              >
                <DownloadIcon />
              </Button>
              <Button
                v-if="!props.readonly"
                variant="ghost"
                size="icon-xs"
                class="text-muted-foreground hover:text-destructive"
                :aria-label="`Delete ${row.doc.title}`"
                @click="emit('deleteDocument', row.doc)"
              >
                <TrashIcon />
              </Button>
            </div>

            <p
              v-if="row.doc.status === 'failed' && row.doc.error_message"
              class="px-2 pb-1.5 pl-11 text-[11px] leading-snug text-destructive"
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
    </template>

    <!-- Drafts -->
    <template v-else>
      <div class="shrink-0 px-2 pt-2">
        <Button variant="outline" size="sm" class="w-full justify-start gap-1.5" as-child>
          <NuxtLink to="/drafts">
            <FileTextIcon class="size-3.5" />
            All drafts
          </NuxtLink>
        </Button>
      </div>

      <div class="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        <p v-if="props.generatedLoading && props.generated.length === 0" class="px-1 py-2 text-xs text-muted-foreground">
          Loading drafts…
        </p>
        <p v-else-if="props.generated.length === 0" class="px-1 py-2 text-xs leading-relaxed text-muted-foreground">
          No drafts yet. Draft a letter, then export it from the conversation.
        </p>

        <div v-for="doc in props.generated" :key="doc.id" class="rounded-lg border bg-background px-2 py-1.5">
          <p class="truncate text-sm">{{ doc.title }}</p>
          <p class="mt-0.5 text-xs text-muted-foreground">{{ formatShortDate(doc.created_at) }}</p>
          <div class="mt-1.5 flex items-center gap-1">
            <Button
              variant="outline"
              size="xs"
              class="flex-1"
              :disabled="props.exporting !== null"
              @click="emit('downloadGenerated', doc, 'word')"
            >
              <Loader2Icon v-if="props.exporting === `${doc.id}:word`" class="animate-spin" />
              <DownloadIcon v-else />
              Word
            </Button>
            <Button
              variant="outline"
              size="xs"
              class="flex-1"
              :disabled="props.exporting !== null"
              @click="emit('downloadGenerated', doc, 'pdf')"
            >
              <Loader2Icon v-if="props.exporting === `${doc.id}:pdf`" class="animate-spin" />
              <DownloadIcon v-else />
              PDF
            </Button>
          </div>
        </div>
      </div>
    </template>
  </aside>
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
