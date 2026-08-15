<script setup lang="ts">
import {
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FileTypeIcon,
  Loader2Icon,
  XIcon,
} from '@lucide/vue'
import type { DocumentPreview } from '~/composables/useDocumentExport'

/**
 * The document preview shown when an assistant answer (or a draft) is exported.
 *
 * PDFs render in a side panel on desktop and a bottom-sheet modal on mobile;
 * Word files open in WordPreviewDialog instead. Every page that exports had its
 * own copy of this panel, so the header, loading and error states drifted
 * apart — this is the single source of truth.
 */
const props = defineProps<{
  preview: DocumentPreview
  /** Width of the desktop panel in px (ignored for the fixed overlay variant). */
  width?: number
  /** Show the left-edge drag handle that resizes the panel. */
  resizable?: boolean
  /** Render as a fixed right-side overlay instead of a flex sibling. */
  fixed?: boolean
  /**
   * Render as a centered modal at every breakpoint, like WordPreviewDialog.
   * Pages without a document workspace beside the panel (drafts) have nothing
   * for a side rail to sit against, so the preview belongs in the middle.
   */
  dialog?: boolean
}>()

const emit = defineEmits<{
  close: []
  'start-resize': [event: PointerEvent]
}>()

const typeIcon = computed(() => (props.preview.type === 'word' ? FileTypeIcon : FileTextIcon))
const typeLabel = computed(() =>
  props.preview.type === 'word' ? 'Word document' : 'PDF document',
)

function onKeydown(event: KeyboardEvent) {
  if (props.dialog && event.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport v-if="dialog" to="body">
    <div
      class="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6"
      style="background: rgb(0 0 0 / 0.45)"
      role="dialog"
      aria-modal="true"
      :aria-label="`Preview ${preview.title}`"
      @click.self="emit('close')"
    >
      <div class="flex h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <DocumentPreviewHeader
          :preview="preview"
          :type-icon="typeIcon"
          :type-label="typeLabel"
          @close="emit('close')"
        />
        <DocumentPreviewBody :preview="preview" :type-label="typeLabel" @close="emit('close')" />
      </div>
    </div>
  </Teleport>

  <template v-else>
  <!--
    Floated clear of the edges in fixed mode rather than pinned flush to them:
    the panel is a detached surface like every other section, so its radius has
    to sit against the page and not against the viewport.
  -->
  <aside
    class="surface relative hidden shrink-0 flex-col overflow-hidden lg:flex"
    :class="fixed ? 'fixed right-4 bottom-4 top-[5.5rem] z-40 w-[28rem] max-w-[calc(100vw-2rem)] shadow-float' : ''"
    :style="fixed ? undefined : { width: `${width ?? 450}px` }"
  >
    <div
      v-if="resizable && !fixed"
      class="group absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize touch-none select-none"
      aria-hidden="true"
      @pointerdown="emit('start-resize', $event)"
    >
      <div class="mx-auto h-full w-px bg-border transition-colors group-hover:bg-primary/60" />
    </div>

    <DocumentPreviewHeader
      :preview="preview"
      :type-icon="typeIcon"
      :type-label="typeLabel"
      @close="emit('close')"
    />

    <DocumentPreviewBody :preview="preview" :type-label="typeLabel" @close="emit('close')" />
  </aside>

  <Teleport to="body">
    <div v-if="preview.type !== 'word'" class="fixed inset-0 z-50 lg:hidden">
      <div class="absolute inset-0 bg-black/60" @click="emit('close')" />
      <div class="absolute inset-4 flex flex-col overflow-hidden rounded-2xl bg-popover shadow-2xl">
        <DocumentPreviewHeader
          :preview="preview"
          :type-icon="typeIcon"
          :type-label="typeLabel"
          @close="emit('close')"
        />
        <DocumentPreviewBody :preview="preview" :type-label="typeLabel" @close="emit('close')" />
      </div>
    </div>
  </Teleport>
  </template>
</template>