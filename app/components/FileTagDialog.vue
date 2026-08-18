<script setup lang="ts">
import {
  CheckIcon,
  ChevronRightIcon,
  EyeIcon,
  FolderIcon,
  FolderMinusIcon,
  FolderOpenIcon,
  GripVerticalIcon,
  InboxIcon,
  Loader2Icon,
  PaletteIcon,
  PlusIcon,
  SearchIcon,
  TagIcon,
  TrashIcon,
  XIcon,
} from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import { cn } from '@/lib/utils'
import { useLabelStore, type AppliedLabel, type Label, type LabelKind } from '~/stores/labels'
import DocumentViewer from '~/components/DocumentViewer.vue'

/**
 * File the case's documents, by dragging each onto a folder in the tree.
 *
 * The old picker listed tags in a dropdown and asked for each selection as a
 * tap. The folder tree the sidebar already groups files under is a better map
 * of where a file can live — so this dialog shows that same tree on the left
 * and the files on the right. Picking a folder (or "Unfiled") narrows the pane
 * to the files under it. With one folder per file, dropping a file onto a
 * folder moves it there — the folder it leaves drops off it — and dropping
 * onto the folder it already sits in takes it back out.
 */
const props = withDefaults(defineProps<{
  /** Which vocabulary to offer. Files are filed under document folders. */
  kind: LabelKind
  /** Every file this dialog can file, each with its current folders. */
  files: Array<{
    id: string
    title: string
    original_filename: string
    mime_type: string
    categories?: AppliedLabel[]
  }>
  /** How many folders a single file may carry at once, per the API. */
  max?: number
  triggerLabel?: string
  /** Overrides on the trigger's own chrome, mirroring LabelPicker. */
  triggerClass?: string
  /** Spoken name for the trigger, needed when `triggerLabel` is icon-only. */
  ariaLabel?: string
  disabled?: boolean
  /**
   * Hide the component's own trigger. Use with v-model:open when the caller
   * renders its own trigger (a per-row button) and the dialog lives once at
   * the caller's root.
   */
  hideTrigger?: boolean
  /**
   * External control of the dialog. Omit it and the component owns its own
   * open state; pass it through v-model to keep the dialog alive across a
   * parent's re-render (a keyed row remounting must not close the modal).
   */
  open?: boolean
}>(), {
  max: 5,
  disabled: false,
  hideTrigger: false,
})

const emit = defineEmits<{
  'update-file': [file: {
    id: string
    title: string
    original_filename: string
    mime_type: string
    categories?: AppliedLabel[]
  }, ids: string[]]
  'update:open': [open: boolean]
}>()

const store = useLabelStore()
const { fileIcon } = useFileTypeIcon()

const internalOpen = ref(false)
const open = computed({
  get: () => props.open ?? internalOpen.value,
  set: (value) => {
    if (props.open !== undefined) emit('update:open', value)
    else internalOpen.value = value
  },
})
const query = ref('')
const creating = ref(false)
const searchInput = ref<HTMLInputElement | null>(null)

/**
 * Colors a custom label may carry, for the picker that styles it. Hex values
 * are what the API stores and the browser can render directly.
 */
const LABEL_COLORS = [
  '#e11d48',
  '#ea580c',
  '#f59e0b',
  '#84cc16',
  '#16a34a',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#a855f7',
  '#ec4899',
  '#64748b',
] as const

/** The label currently recoloring, so its palette stays open until chosen. */
const pickingColorFor = ref<string | null>(null)
const colorPending = ref(false)

async function setLabelColor(label: Label, color: string | null) {
  if (colorPending.value) return
  colorPending.value = true
  pickingColorFor.value = null
  try {
    await store.updateLabel(label.id, { color })
  } catch (error) {
    const message = (error as { data?: { errors?: Record<string, string[]> } })?.data?.errors?.color?.[0]
    toast.error(message ?? 'That color could not be saved.')
  } finally {
    colorPending.value = false
  }
}

/** Categories that hold a given file, as their labels. */
function categoriesOf(fileId: string): Label[] {
  const file = props.files.find((item) => item.id === fileId)
  return (file?.categories ?? [])
    .map((category) => store.byId.get(category.id))
    .filter((label): label is Label => label !== undefined)
}

function atCapacity(fileId: string) {
  const file = props.files.find((item) => item.id === fileId)
  return (file?.categories?.length ?? 0) >= props.max
}

/** Collapsed groups in the tree; everything else hangs open. */
const collapsed = ref<Set<string>>(new Set())

function toggleGroup(name: string) {
  const next = new Set(collapsed.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  collapsed.value = next
}

function groupCollapsed(name: string) {
  return collapsed.value.has(name)
}

/** How many of the dialog's files sit under a given folder. */
function countInCategory(labelId: string) {
  return props.files.filter((file) => (file.categories ?? []).some((category) => category.id === labelId)).length
}

const groups = computed(() => {
  const needle = query.value.trim().toLowerCase()

  return store.grouped(props.kind)
    .map((group) => ({
      ...group,
      name: group.name === 'Your labels' ? 'My folders' : group.name,
      labels: needle
        ? group.labels.filter((label) => label.name.toLowerCase().includes(needle)
          || label.description?.toLowerCase().includes(needle))
        : group.labels,
    }))
    .filter((group) => group.labels.length > 0)
    .sort((a, b) => {
      if (a.name === 'My folders') return -1
      if (b.name === 'My folders') return 1
      return 0
    })
})

const canCreate = computed(() => {
  const needle = query.value.trim()
  if (needle.length === 0) return false

  return !store.labels.some((label) => label.kind === props.kind
    && label.name.toLowerCase() === needle.toLowerCase())
})

function isFiled(fileId: string, labelId: string) {
  return (props.files.find((item) => item.id === fileId)?.categories ?? [])
    .some((category) => category.id === labelId)
}

/**
 * One folder per file when `max` is 1, so dropping onto a folder moves a file
 * there instead of stacking another folder on it. Dropping onto the folder the
 * file already sits in takes it back out; `max` > 1 still appends.
 */
function toggle(fileId: string, label: Label) {
  const file = props.files.find((item) => item.id === fileId)
  if (!file) return

  const isCurrent = isFiled(fileId, label.id)

  if (props.max === 1) {
    emit('update-file', file, isCurrent ? [] : [label.id])
    return
  }

  const current = (file.categories ?? []).map((category) => category.id)
  if (isCurrent) {
    emit('update-file', file, current.filter((id) => id !== label.id))
    return
  }
  if (atCapacity(fileId)) {
    toast.error(`A file can carry at most ${props.max} folders.`)
    return
  }
  emit('update-file', file, [...current, label.id])
}

/**
 * The files shown on the right. By default everything; picking a folder in the
 * tree narrows the pane to the files filed under it; "Unfiled" shows the files
 * that have no folder yet.
 */
const selectedFolderId = ref<string | null>(null)
const showUnfiled = ref(false)

function selectFolder(labelId: string | null, unfiled = false) {
  selectedFolderId.value = labelId
  showUnfiled.value = unfiled
}

const filteredFiles = computed(() => {
  if (selectedFolderId.value) {
    return props.files.filter((file) =>
      (file.categories ?? []).some((category) => category.id === selectedFolderId.value))
  }
  if (showUnfiled.value) {
    return props.files.filter((file) => !file.categories || file.categories.length === 0)
  }
  return props.files
})

const selectedViewName = computed(() => {
  if (selectedFolderId.value) return store.byId.get(selectedFolderId.value)?.name ?? 'All files'
  if (showUnfiled.value) return 'Unfiled'
  return 'All files'
})

const unfiledCount = computed(() =>
  props.files.filter((file) => !file.categories || file.categories.length === 0).length)

/** The file open in the inline preview dialog, null while it is closed. */
const previewing = ref<{
  id: string
  title: string
  original_filename: string
  mime_type: string
} | null>(null)

/** The color a newly created label starts with, if the user picks one. */
const newLabelColor = ref<string | null>(null)

async function createFromQuery() {
  const name = query.value.trim()
  if (!name || creating.value) return

  creating.value = true
  try {
    const label = await store.createLabel({ kind: props.kind, name, color: newLabelColor.value ?? undefined })
    query.value = ''
    newLabelColor.value = null
    toast.success(`Created "${label.name}"`)
  } catch (error) {
    const message = (error as { data?: { errors?: Record<string, string[]> } })?.data?.errors?.name?.[0]
    toast.error(message ?? 'That folder could not be created.')
  } finally {
    creating.value = false
  }
}

function openDialog() {
  if (props.disabled) return
  open.value = true
  query.value = ''
  selectFolder(null)
  void store.fetchLabels()
  nextTick(() => searchInput.value?.focus())
}

/** The label being renamed inline, so its row becomes an input until saved. */
const editingId = ref<string | null>(null)
const editDraft = ref('')
const renaming = ref(false)
const renameInput = ref<HTMLInputElement | null>(null)

/** Start editing a label on double-click; system and read-only labels are left alone. */
function startRename(label: Label) {
  if (label.scope === 'system' || !label.is_editable) return
  editingId.value = label.id
  editDraft.value = label.name
  pickingColorFor.value = null
  nextTick(() => {
    renameInput.value?.focus()
    renameInput.value?.select()
  })
}

function cancelRename() {
  editingId.value = null
  editDraft.value = ''
}

async function commitRename(label: Label) {
  if (editingId.value !== label.id || renaming.value) return
  const name = editDraft.value.trim()
  if (!name || name === label.name) {
    cancelRename()
    return
  }
  renaming.value = true
  try {
    await store.updateLabel(label.id, { name })
    toast.success(`Renamed to "${name}"`)
    cancelRename()
  } catch (error) {
    const message = (error as { data?: { errors?: Record<string, string[]> } })?.data?.errors?.name?.[0]
    toast.error(message ?? 'That folder could not be renamed.')
    nextTick(() => {
      renameInput.value?.focus()
      renameInput.value?.select()
    })
  } finally {
    renaming.value = false
  }
}

/** Row tooltip: the description, or an editing hint when the label is editable. */
function labelTitle(label: Label) {
  if (label.description) return label.description
  return label.scope !== 'system' && label.is_editable ? 'Double-click to rename' : undefined
}

const deleting = ref(false)

/** The label the delete dialog is asking about; null keeps the dialog shut. */
const confirmDelete = ref<Label | null>(null)

const confirmOpen = computed({
  get: () => confirmDelete.value !== null,
  set: (value) => {
    if (!value) confirmDelete.value = null
  },
})

function removeLabel(label: Label) {
  confirmDelete.value = label
}

async function performDelete() {
  const label = confirmDelete.value
  if (!label || deleting.value) return
  deleting.value = true
  confirmDelete.value = null
  try {
    await store.deleteLabel(label.id)
    if (editingId.value === label.id) cancelRename()
    toast.success(`Deleted "${label.name}"`)
  } catch (error) {
    const message = (error as { data?: { message?: string } })?.data?.message
    toast.error(message ?? 'That folder could not be deleted.')
  } finally {
    deleting.value = false
  }
}

function closeDialog() {
  open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) closeDialog()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  void store.fetchLabels()
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

/* -------------------------------------------------------------------------
 * Drag and drop
 * ---------------------------------------------------------------------- */

const draggingId = ref<string | null>(null)
const overId = ref<string | null>(null)

/** The file leaves the dialog as a draggable stand-in for the folders it carries. */
function onFileDragStart(event: DragEvent, fileId: string) {
  draggingId.value = fileId
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('text/plain', fileId)
  }
}

function onFileDragEnd() {
  draggingId.value = null
  overId.value = null
}

/** Allow the drop on a folder row and mark it as the one under the cursor. */
function onTagDragOver(event: DragEvent, label: Label) {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  overId.value = label.id
}

function onTagDragLeave(event: DragEvent, label: Label) {
  const related = event.relatedTarget as Node | null
  if (!related || !event.currentTarget || !(event.currentTarget as Node).contains(related)) {
    if (overId.value === label.id) overId.value = null
  }
}

/** Dropping a file onto a folder files it there — or takes it back out. */
function onTagDrop(event: DragEvent, label: Label) {
  event.preventDefault()
  overId.value = null
  const fileId = event.dataTransfer?.getData('text/plain') ?? draggingId.value
  if (fileId && props.files.some((item) => item.id === fileId)) toggle(fileId, label)
  draggingId.value = null
}

function onKeydownEscape() {
  if (open.value) closeDialog()
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5">
    <button
      v-if="!props.hideTrigger"
      type="button"
      :disabled="props.disabled"
      :aria-label="props.ariaLabel"
      :class="cn(
        'inline-flex items-center gap-1 rounded-md border border-dashed bg-muted/45 px-2 py-0.5 text-xs text-muted-foreground hover:border-solid hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50',
        props.triggerClass,
      )"
      @click="openDialog"
    >
      <TagIcon class="size-3" />
      {{ props.triggerLabel ?? 'File' }}
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        class="fixed inset-0 z-[120] flex items-center justify-center p-4 backdrop-blur-sm"
        style="background: rgb(0 0 0 / 0.45)"
        role="dialog"
        aria-modal="true"
        aria-label="File under a folder"
        @click.self="closeDialog"
      >
        <div class="flex max-h-[86dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
          <!-- Header -->
          <div class="flex items-start gap-3 border-b px-5 py-3.5">
            <div class="min-w-0 flex-1">
              <h2 class="text-sm font-semibold">File under a folder</h2>
              <p class="mt-0.5 truncate text-xs text-muted-foreground">
                Pick a file up and drop it onto a folder to file it there.
              </p>
            </div>
            <Button variant="ghost" size="icon" class="size-7" aria-label="Close" @click="closeDialog">
              <XIcon class="size-4" />
            </Button>
          </div>

          <!-- Body -->
          <div class="flex min-h-0 flex-1">
            <!-- Tree of folders -->
            <div class="flex w-64 shrink-0 flex-col border-r">
              <div class="flex items-center gap-2 border-b px-2.5 py-1.5">
                <SearchIcon class="size-3.5 shrink-0 text-muted-foreground" />
                <input
                  ref="searchInput"
                  v-model="query"
                  class="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  placeholder="Search or create…"
                  @keydown.enter.prevent="canCreate && createFromQuery()"
                  @keydown.esc="onKeydownEscape"
                />
              </div>

              <div class="min-h-0 flex-1 overflow-y-auto p-1.5">
                <div v-if="store.loading && store.labels.length === 0" class="px-2 py-3 text-center text-xs text-muted-foreground">
                  <Loader2Icon class="mx-auto size-4 animate-spin" />
                </div>

                <button
                  type="button"
                  class="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  :class="!selectedFolderId && !showUnfiled
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/10 dark:hover:text-popover-foreground'"
                  @click="selectFolder(null)"
                >
                  <InboxIcon class="size-3.5 shrink-0" />
                  <span class="min-w-0 flex-1 truncate text-left">All files</span>
                  <span class="shrink-0 rounded bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">{{ props.files.length }}</span>
                </button>

                <button
                  type="button"
                  class="mt-0.5 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  :class="showUnfiled
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/10 dark:hover:text-popover-foreground'"
                  @click="selectFolder(null, true)"
                >
                  <FolderMinusIcon class="size-3.5 shrink-0" />
                  <span class="min-w-0 flex-1 truncate text-left">Unfiled</span>
                  <span class="shrink-0 rounded bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">{{ unfiledCount }}</span>
                </button>

                <div v-if="props.files.length > 0" class="mb-1.5 mt-1.5 h-px w-full bg-border" aria-hidden="true" />

                <div v-for="(group, index) in groups" :key="group.name" class="mb-1">
                  <div
                    v-if="index > 0 && groups[index - 1].name === 'Your labels'"
                    class="mb-1 h-px w-full bg-border"
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    :aria-expanded="!groupCollapsed(group.name)"
                    class="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    @click="toggleGroup(group.name)"
                  >
                    <ChevronRightIcon
                      class="size-3.5 shrink-0 transition-transform"
                      :class="groupCollapsed(group.name) ? '' : 'rotate-90'"
                    />
                    <FolderIcon class="size-3.5 shrink-0" />
                    <span class="min-w-0 flex-1 truncate text-left">{{ group.name }}</span>
                  </button>

                  <div v-if="!groupCollapsed(group.name)" class="ml-[15px] space-y-0.5 border-l pl-1.5">
                    <div
                      v-for="label in group.labels"
                      :key="label.id"
                      class="relative flex items-center rounded-md transition-colors focus-within:ring-2 focus-within:ring-ring/50"
                      :class="overId === label.id ? 'ring-1 ring-primary/60' : ''"
                    >
                      <input
                        v-if="editingId === label.id"
                        ref="renameInput"
                        v-model="editDraft"
                        type="text"
                        maxlength="255"
                        :disabled="renaming"
                        class="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-xs outline-none ring-1 ring-primary/50 focus-visible:ring-2 focus-visible:ring-ring/50"
                        :aria-label="`Rename ${label.name}`"
                        @click.stop
                        @dblclick.stop
                        @keydown.enter.prevent="commitRename(label)"
                        @keydown.esc="cancelRename"
                        @blur="commitRename(label)"
                      />

                      <button
                        v-if="editingId === label.id"
                        type="button"
                        class="mr-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
                        :aria-label="`Delete folder ${label.name}`"
                        :disabled="renaming || deleting"
                        @mousedown.prevent
                        @click.stop="removeLabel(label)"
                      >
                        <TrashIcon class="size-3" />
                      </button>

                      <button
                        v-if="editingId === label.id"
                        type="button"
                        class="mr-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
                        :aria-label="`Cancel renaming ${label.name}`"
                        :disabled="renaming || deleting"
                        @mousedown.prevent
                        @click.stop="cancelRename"
                      >
                        <XIcon class="size-3" />
                      </button>

                      <button
                        v-else
                        type="button"
                        class="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        :class="[
                          selectedFolderId === label.id
                            ? 'bg-primary/10 font-medium text-primary'
                            : 'text-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/10 dark:hover:text-popover-foreground',
                          overId === label.id ? 'ring-1 ring-primary/60 bg-primary/5' : '',
                        ]"
                        :title="labelTitle(label)"
                        @click="selectFolder(label.id)"
                        @dragover="onTagDragOver($event, label)"
                        @dragleave="onTagDragLeave($event, label)"
                        @drop="onTagDrop($event, label)"
                        @dblclick.stop="startRename(label)"
                      >
                        <span
                          class="size-2 shrink-0 rounded-full"
                          :class="label.color ? '' : 'bg-muted-foreground/40'"
                          :style="label.color ? { backgroundColor: label.color } : undefined"
                          aria-hidden="true"
                        />
                        <span class="min-w-0 flex-1 truncate">{{ label.name }}</span>
                        <CheckIcon
                          v-if="selectedFolderId === label.id"
                          class="size-3 shrink-0"
                          :stroke-width="2.5"
                        />
                        <span
                          class="shrink-0 rounded bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground"
                          :title="`${countInCategory(label.id)} file${countInCategory(label.id) === 1 ? '' : 's'} filed here`"
                        >
                          {{ countInCategory(label.id) }}
                        </span>
                      </button>

                      <button
                        v-if="label.scope !== 'system' && label.is_editable && editingId !== label.id"
                        type="button"
                        :class="cn(
                          'mr-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                          pickingColorFor === label.id ? 'bg-accent text-accent-foreground' : '',
                        )"
                        :aria-label="`Choose color for ${label.name}`"
                        @click.stop="pickingColorFor = pickingColorFor === label.id ? null : label.id"
                      >
                        <PaletteIcon class="size-3" />
                      </button>

                      <div
                        v-if="pickingColorFor === label.id"
                        class="absolute right-1 top-full z-10 mt-1 flex items-center gap-1 rounded-lg border bg-popover p-1.5 shadow-lg"
                        @click.stop
                      >
                        <button
                          v-for="color in LABEL_COLORS"
                          :key="color"
                          type="button"
                          class="size-4 rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                          :class="label.color === color ? 'ring-2 ring-ring ring-offset-1' : ''"
                          :style="{ backgroundColor: color }"
                          :aria-label="`Use ${color}`"
                          :disabled="colorPending"
                          @click="setLabelColor(label, color)"
                        />
                        <button
                          type="button"
                          class="flex size-4 items-center justify-center rounded-full border border-dashed text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                          :aria-label="`Clear color for ${label.name}`"
                          :disabled="colorPending"
                          @click="setLabelColor(label, null)"
                        >
                          <XIcon class="size-2.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <p v-if="groups.length === 0 && !store.loading" class="px-2 py-3 text-center text-xs text-muted-foreground">
                  No folders match.
                </p>
              </div>

              <div v-if="canCreate" class="border-t">
                <div class="flex flex-wrap items-center gap-1 px-3 py-1.5">
                  <span class="text-[10px] uppercase tracking-wide text-muted-foreground">Color</span>
                  <button
                    v-for="color in LABEL_COLORS"
                    :key="color"
                    type="button"
                    class="size-4 rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    :class="newLabelColor === color ? 'ring-2 ring-ring ring-offset-1' : ''"
                    :style="{ backgroundColor: color }"
                    :aria-label="`Use ${color}`"
                    @click="newLabelColor = newLabelColor === color ? null : color"
                  />
                  <button
                    type="button"
                    class="flex size-4 items-center justify-center rounded-full border border-dashed text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    :aria-label="'No color'"
                    @click="newLabelColor = null"
                  >
                    <XIcon class="size-2.5" />
                  </button>
                </div>
                <button
                  type="button"
                  :disabled="creating"
                  class="flex w-full items-center gap-2 px-3 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/10 dark:hover:text-popover-foreground disabled:opacity-50"
                  @click="createFromQuery"
                >
                  <Loader2Icon v-if="creating" class="size-3.5 animate-spin" />
                  <PlusIcon v-else class="size-3.5" />
                  Create "{{ query.trim() }}"
                </button>
              </div>
            </div>

            <!-- The files in the selected folder (or all of them) -->
            <div class="flex min-w-0 flex-1 flex-col">
              <div class="flex items-center gap-2 border-b px-4 py-2.5">
                <FolderOpenIcon class="size-4 shrink-0 text-muted-foreground" />
                <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ selectedViewName }}</span>
                <span class="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                  {{ filteredFiles.length }} file{{ filteredFiles.length === 1 ? '' : 's' }}
                </span>
              </div>

              <div class="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-4">
                <div
                  v-for="file in filteredFiles"
                  :key="file.id"
                  draggable="true"
                  :class="cn(
                    'flex items-center gap-3 rounded-xl border p-3 transition-colors active:cursor-grabbing',
                    draggingId === file.id ? 'cursor-grabbing border-primary/60 bg-primary/5' : 'cursor-grab border-muted bg-muted/20 hover:border-primary/30',
                  )"
                  @dragstart="onFileDragStart($event, file.id)"
                  @dragend="onFileDragEnd"
                >
                  <GripVerticalIcon class="size-4 shrink-0 text-muted-foreground/60" />
                  <component :is="fileIcon(file.original_filename, file.mime_type)" class="size-5 shrink-0 text-muted-foreground" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-medium">{{ file.title }}</span>
                    <span v-if="categoriesOf(file.id).length > 0" class="mt-0.5 inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      <FolderIcon class="size-2.5" />
                      {{ categoriesOf(file.id)[0].name }}
                    </span>
                    <span v-else class="mt-0.5 inline-flex items-center gap-1.5 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      Not filed
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="size-7 shrink-0 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    :aria-label="`Preview ${file.title}`"
                    @click.stop="previewing = file"
                  >
                    <EyeIcon class="size-3.5" />
                  </Button>
                </div>

                <div
                  v-if="filteredFiles.length === 0"
                  class="flex flex-col items-center gap-1.5 px-2 py-10 text-center"
                >
                  <FolderOpenIcon class="size-6 text-muted-foreground/40" />
                  <p class="text-xs text-muted-foreground">
                    <template v-if="showUnfiled">Nothing is unfiled.</template>
                    <template v-else-if="selectedFolderId">No files in this folder yet — drop one onto it to file it here.</template>
                    <template v-else>No files to file.</template>
                  </p>
                </div>
              </div>

              <div class="flex items-center justify-between gap-2 border-t px-4 py-3">
                <p class="text-[0.7rem] text-muted-foreground">
                  Drag a file onto a folder to move it there — drop on its own folder to unfile it.
                </p>
                <Button size="sm" @click="closeDialog">Done</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <AlertDialog v-model:open="confirmOpen">
      <AlertDialogContent class="z-[130]">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete folder?</AlertDialogTitle>
          <AlertDialogDescription>
            "<span class="text-foreground font-medium">{{ confirmDelete?.name }}</span>" will be removed. Documents filed under it stay attached to the case.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="deleting">Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" :disabled="deleting" @click="performDelete">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <DocumentViewer v-if="previewing" :document="previewing" z-class="z-[130]" @close="previewing = null" />
  </div>
</template>