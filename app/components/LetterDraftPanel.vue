<script setup lang="ts">
import {
  FileTextIcon,
  FileTypeIcon,
  Loader2Icon,
  MaximizeIcon,
  MinimizeIcon,
  PenLineIcon,
  SaveIcon,
  XIcon,
} from '@lucide/vue'
import LetterEditor from '~/components/LetterEditor.vue'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '~/components/ui/sheet'
import { toast } from '~/components/ui/sonner'
import type { LetterDraftPayload, TiptapDoc } from '~/types/tiptap'
import { buildDocxFromTiptap } from '~/utils/tiptapDocx'
import { buildPdfFromTiptap } from '~/utils/tiptapPdf'

const props = defineProps<{
  draft: LetterDraftPayload
  open: boolean
}>()

const emit = defineEmits<{ close: [] }>()

const api = useApi()
const editorRef = ref<InstanceType<typeof LetterEditor> | null>(null)
const doc = ref<TiptapDoc | null>(props.draft.content)
const exporting = ref<'word' | 'pdf' | null>(null)
const saving = ref(false)

// A fresh draft (a new turn, a reopened message) replaces whatever is on
// screen; the user's own edits are only ever touched by the editor itself.
watch(
  () => props.draft,
  (next) => {
    doc.value = next.content
  },
)

const drafting = computed(() => props.draft.drafting === true || doc.value === null)

/**
 * Full screen.
 *
 * A letter is a page, and the sheet is half a viewport wide — long enough
 * paragraphs wrap three times over and the document stops looking like the
 * thing it will be printed as. The state lives here rather than in the editor
 * because the sheet itself has to widen; the editor only reflects it.
 */
const fullscreen = ref(false)

function toggleFullscreen() {
  fullscreen.value = !fullscreen.value
}

/**
 * Drag-to-resize from the sheet's left edge. The width is tracked in pixels so
 * the handle can move freely; the CSS still owns the default size until the
 * user grabs the handle. A 95vw ceiling keeps the canvas visible beside it —
 * the full-screen button is the path to a true edge-to-edge view.
 */
const sheetWidth = ref<number | null>(null)
const dragging = ref(false)
let resizeStartX = 0
let resizeStartWidth = 0

const MIN_WIDTH = 320
const MAX_WIDTH_RATIO = 0.95

function onResizeStart(event: PointerEvent) {
  if (fullscreen.value || dragging.value) return

  const sheetEl = (event.currentTarget as HTMLElement | null)
    ?.closest('[data-slot="sheet-content"]') as HTMLElement | null
  if (!sheetEl) return

  resizeStartX = event.clientX
  resizeStartWidth = sheetEl.offsetWidth
  dragging.value = true

  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', onResizeEnd)
  event.preventDefault()
}

function onResizeMove(event: PointerEvent) {
  if (!dragging.value) return
  // The sheet hangs off the right edge, so dragging left widens it.
  const delta = resizeStartX - event.clientX
  const maxWidth = Math.round(window.innerWidth * MAX_WIDTH_RATIO)
  sheetWidth.value = Math.max(MIN_WIDTH, Math.min(maxWidth, resizeStartWidth + delta))
}

function onResizeEnd() {
  dragging.value = false
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', onResizeEnd)
}

onUnmounted(() => {
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', onResizeEnd)
})

// Reset when the panel closes, so reopening never starts in a state the user
// left behind on a different letter.
watch(() => props.open, (open) => {
  if (!open) {
    fullscreen.value = false
    sheetWidth.value = null
  }
})

/** Esc leaves full screen before it closes the sheet. */
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && fullscreen.value) {
    event.preventDefault()
    event.stopPropagation()
    fullscreen.value = false
  }
}

function download(blob: Blob, extension: string) {
  const title = (props.draft.title ?? 'Letter').toLowerCase().replace(/\s+/g, '-')
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${title}.${extension}`
  anchor.click()
  URL.revokeObjectURL(url)
}

async function exportDoc(type: 'word' | 'pdf') {
  if (drafting.value) return
  exporting.value = type
  try {
    const content = editorRef.value?.getJSON() ?? doc.value ?? { type: 'doc', content: [{ type: 'paragraph' }] }
    const blob = type === 'word'
      ? await buildDocxFromTiptap(content, props.draft.title ?? 'Letter')
      : await buildPdfFromTiptap(content, props.draft.title ?? 'Letter')
    download(blob, type)
  } catch (error) {
    console.error('Letter export failed', error)
    toast.error('Could not export the letter. Please try again.')
  } finally {
    exporting.value = null
  }
}

async function save() {
  const messageId = props.draft.messageId
  if (!messageId || drafting.value || saving.value) return
  saving.value = true
  try {
    const content = editorRef.value?.getJSON() ?? doc.value ?? { type: 'doc', content: [{ type: 'paragraph' }] }
    await api(`/messages/${messageId}/letter-draft`, {
      method: 'PATCH',
      body: {
        content,
        title: props.draft.title ?? null,
      },
    })
    toast.success('Letter saved')
  } catch {
    toast.error('Could not save the letter. Please try again.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Sheet :open="open" @update:open="(v) => { if (!v) emit('close') }">
    <SheetContent
      side="right"
      class="letter-sheet w-full p-0 border-l"
      :class="[
        fullscreen ? 'letter-sheet--full' : '',
        dragging ? 'letter-sheet--dragging' : '',
      ]"
      :style="sheetWidth !== null
        ? { width: `${sheetWidth}px`, maxWidth: '95vw', minWidth: `${MIN_WIDTH}px` }
        : {}"
      :show-close-button="false"
      @keydown.capture="onKeydown"
    >
      <!-- Left-edge drag handle to resize the sheet. Hidden while full screen. -->
      <div
        v-if="!fullscreen"
        class="group absolute left-0 top-0 z-20 h-full w-2 cursor-col-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Drag to resize the letter panel"
        @pointerdown.prevent="onResizeStart"
      >
        <span class="absolute left-0 top-1/2 h-12 w-1 -translate-y-1/2 rounded-full bg-border transition-colors group-hover:bg-primary/40 group-active:bg-primary/60" />
      </div>

      <SheetTitle class="sr-only">{{ draft.title ?? 'Letter draft' }}</SheetTitle>
      <SheetDescription class="sr-only">Edit, sign, save, and export your letter.</SheetDescription>

      <div class="flex h-full flex-col">
        <div class="flex items-center gap-3 border-b px-4 py-3">
          <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <PenLineIcon class="size-4 text-primary" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold">
              <template v-if="drafting">
                <Loader2Icon class="mr-1.5 inline size-3.5 animate-spin align-[-2px]" />
                Drafting your letter…
              </template>
              <template v-else>{{ draft.title ?? 'Letter draft' }}</template>
            </p>
            <p class="text-xs text-muted-foreground">
              {{ drafting ? 'The assistant is composing it right now.' : 'Edit it, add your signature, then save or export.' }}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="size-8 shrink-0"
            :aria-label="fullscreen ? 'Exit full screen' : 'Full screen'"
            :aria-pressed="fullscreen"
            :title="fullscreen ? 'Exit full screen (Esc)' : 'Full screen'"
            @click="toggleFullscreen"
          >
            <MinimizeIcon v-if="fullscreen" class="size-4" />
            <MaximizeIcon v-else class="size-4" />
          </Button>
          <Button variant="ghost" size="icon" class="size-8 shrink-0" aria-label="Close" @click="emit('close')">
            <XIcon class="size-4" />
          </Button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto bg-muted/30">
          <div v-if="drafting" class="flex h-full min-h-[24rem] flex-col items-center justify-center gap-3 text-center">
            <Loader2Icon class="size-8 animate-spin text-muted-foreground" />
            <div>
              <p class="text-sm font-medium">Composing your letter</p>
              <p class="mt-1 text-xs text-muted-foreground">It will appear here the moment it is ready.</p>
            </div>
          </div>
          <div v-else class="min-h-full">
            <LetterEditor
              ref="editorRef"
              :content="doc"
              :fullscreen="fullscreen"
              :message-id="draft.messageId ?? null"
              placeholder="Write your letter…"
              @update="doc = $event"
              @toggle-fullscreen="toggleFullscreen"
            />
          </div>
        </div>

        <div class="flex items-center gap-1.5 border-t bg-card px-4 py-3">
          <Button
            size="sm"
            class="h-8 gap-1.5 px-3 text-xs"
            :disabled="saving || drafting || !draft.messageId"
            title="Save your edits to the conversation"
            @click="save"
          >
            <Loader2Icon v-if="saving" class="size-3.5 animate-spin" />
            <SaveIcon v-else class="size-3.5" />
            Save
          </Button>
          <span class="mx-1 h-5 w-px bg-border" aria-hidden="true" />
          <Button
            variant="outline"
            size="sm"
            class="ml-auto h-8 gap-1.5 px-3 text-xs"
            :disabled="exporting !== null || drafting"
            title="Download as Word document (.docx)"
            @click="exportDoc('word')"
          >
            <Loader2Icon v-if="exporting === 'word'" class="size-3.5 animate-spin" />
            <FileTypeIcon v-else class="size-3.5" />
            Word
            <span class="rounded bg-muted px-1 py-px text-[10px] font-medium text-muted-foreground">.docx</span>
          </Button>
          <Button
            size="sm"
            class="h-8 gap-1.5 px-3 text-xs"
            :disabled="exporting !== null || drafting"
            title="Download as PDF document (.pdf)"
            @click="exportDoc('pdf')"
          >
            <Loader2Icon v-if="exporting === 'pdf'" class="size-3.5 animate-spin" />
            <FileTextIcon v-else class="size-3.5" />
            PDF
          </Button>
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>
