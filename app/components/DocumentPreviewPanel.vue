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
}>()

const emit = defineEmits<{
  close: []
  'start-resize': [event: PointerEvent]
}>()

const typeIcon = computed(() => (props.preview.type === 'word' ? FileTypeIcon : FileTextIcon))
const typeLabel = computed(() =>
  props.preview.type === 'word' ? 'Word document' : 'PDF document',
)
</script>

<template>
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