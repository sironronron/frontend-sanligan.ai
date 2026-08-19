<script setup lang="ts">
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  EraserIcon,
  GripVerticalIcon,
  PenLineIcon,
  RefreshCwIcon,
} from '@lucide/vue'
import { nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'
import type { SignatureAlign, SignatureAttributes, SignedSignature } from '~/types/tiptap'
import SignatureCaptureDialog from './SignatureCaptureDialog.vue'

const props = defineProps(nodeViewProps)

const dialogOpen = ref(false)

const attrs = computed(() => props.node.attrs as SignatureAttributes)

const alignClass = computed(() => {
  // While it is being dragged, and once it has been dragged, the signature is
  // positioned by its own left margin — so the row must start at the left edge
  // for that margin to mean "distance from the left of the line". Without this
  // a right-aligned signature would jump on the first drag frame.
  if (draggingLeft.value !== null || attrs.value.offsetX !== null) return 'justify-start'

  switch (attrs.value.align) {
    case 'left':
      return 'justify-start'
    case 'center':
      return 'justify-center'
    default:
      return 'justify-end'
  }
})

/**
 * Horizontal drag.
 *
 * The signature is a block node, and ProseMirror can only ever drop a block at
 * a block boundary — which is why the native drag moves it up and down but
 * never across. So sideways movement is handled here instead: a pointer drag
 * on the signature itself slides it along its line and stores where it landed
 * as a percentage of the line's width, letting the user park it exactly over
 * the space the letter leaves for a signature.
 */
const card = useTemplateRef<HTMLElement>('card')

/**
 * The full width of the line the signature sits on — the node view's own
 * wrapper element, read off the card rather than through a template ref
 * because `NodeViewWrapper` is a component and a ref on it yields the
 * instance, not the div.
 */
function rowElement(): HTMLElement | null {
  return card.value?.parentElement ?? null
}

/** Live left offset in px while a drag is in flight; null when idle. */
const draggingLeft = ref<number | null>(null)
const dragPointerId = ref<number | null>(null)

/** A drag start that has not yet passed the threshold that makes it a drag. */
let pending: { pointerId: number; startX: number; originLeft: number; maxLeft: number } | null = null

const DRAG_THRESHOLD = 3

const cardStyle = computed(() => {
  if (draggingLeft.value !== null) return { marginLeft: `${draggingLeft.value}px` }
  if (attrs.value.offsetX !== null) return { marginLeft: `${attrs.value.offsetX}%` }
  return {}
})

function onPointerDown(event: PointerEvent) {
  // Only a plain left-button drag on the signature itself. The buttons under
  // it and the grip keep their own behaviour.
  if (event.button !== 0) return
  if ((event.target as HTMLElement | null)?.closest('button, [data-drag-handle]')) return

  const rowEl = rowElement()
  const cardEl = card.value
  if (!rowEl || !cardEl) return

  const rowBox = rowEl.getBoundingClientRect()
  const cardBox = cardEl.getBoundingClientRect()

  pending = {
    pointerId: event.pointerId,
    startX: event.clientX,
    originLeft: cardBox.left - rowBox.left,
    maxLeft: Math.max(rowBox.width - cardBox.width, 0),
  }
}

function onPointerMove(event: PointerEvent) {
  if (!pending || event.pointerId !== pending.pointerId) return

  const delta = event.clientX - pending.startX

  if (draggingLeft.value === null) {
    if (Math.abs(delta) < DRAG_THRESHOLD) return

    // Past the threshold: this is a drag, not a click. Capture the pointer so
    // the signature keeps following it even when the cursor runs off the card,
    // and stop the native block drag from firing on top of it.
    dragPointerId.value = event.pointerId
    card.value?.setPointerCapture(event.pointerId)
  }

  event.preventDefault()
  draggingLeft.value = clamp(pending.originLeft + delta, 0, pending.maxLeft)
}

function onPointerUp(event: PointerEvent) {
  if (!pending || event.pointerId !== pending.pointerId) return

  const left = draggingLeft.value
  const rowWidth = rowElement()?.getBoundingClientRect().width ?? 0

  if (dragPointerId.value !== null) {
    card.value?.releasePointerCapture(dragPointerId.value)
    dragPointerId.value = null
  }

  pending = null
  draggingLeft.value = null

  if (left === null || rowWidth <= 0) return

  // Stored as a percentage so the placement survives the panel being resized,
  // exported to a different page width, or reopened on another screen.
  props.updateAttributes({ offsetX: round(clamp((left / rowWidth) * 100, 0, 100)) })
}

function onPointerCancel(event: PointerEvent) {
  if (!pending || event.pointerId !== pending.pointerId) return

  if (dragPointerId.value !== null) {
    card.value?.releasePointerCapture(dragPointerId.value)
    dragPointerId.value = null
  }

  pending = null
  draggingLeft.value = null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function round(value: number) {
  return Math.round(value * 100) / 100
}

/** Alignment is the coarse control, so choosing one drops a dragged offset. */
function setAlign(align: SignatureAlign) {
  props.updateAttributes({ align, offsetX: null })
}

function onSigned(signature: SignedSignature) {
  props.updateAttributes({
    src: signature.src,
    signedAt: signature.signedAt,
    signerName: signature.signerName,
    width: signature.width,
    height: signature.height,
  })
  dialogOpen.value = false
}

function clear() {
  props.updateAttributes({
    src: null,
    signedAt: null,
    signerName: null,
    width: null,
    height: null,
  })
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
</script>

<template>
  <NodeViewWrapper :class="['group relative my-4 flex', alignClass]">
    <span
      class="absolute left-1 top-1/2 -translate-y-1/2 cursor-grab rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 active:cursor-grabbing"
      title="Drag to move the signature between lines"
      data-drag-handle
      draggable="true"
      aria-hidden="true"
    >
      <GripVerticalIcon class="size-4" />
    </span>

    <div
      v-if="!attrs.src"
      class="flex w-full max-w-[22rem] flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border bg-muted/40 px-6 py-6"
    >
      <span class="flex size-9 items-center justify-center rounded-full bg-primary/10">
        <PenLineIcon class="size-4 text-primary" />
      </span>
      <p class="text-sm font-medium">Signature</p>
      <Button variant="outline" size="sm" class="mt-1 gap-1.5" @click="dialogOpen = true">
        <PenLineIcon class="size-3.5" />
        Add signature
      </Button>
    </div>

    <div
      v-else
      ref="card"
      class="flex w-full max-w-[26rem] cursor-grab touch-none select-none flex-col items-center gap-2 rounded-lg border border-border bg-muted/40 px-6 py-4"
      :class="draggingLeft !== null && 'cursor-grabbing shadow-lg'"
      :style="cardStyle"
      title="Drag left or right to place the signature on its line"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @dragstart.prevent.stop
    >
      <img
        :src="attrs.src"
        :alt="`Signature of ${attrs.signerName ?? 'sender'}`"
        class="pointer-events-none max-h-24 w-auto object-contain"
        style="image-rendering: auto"
        draggable="false"
        @dragstart.prevent
      >
      <div class="flex items-center gap-3 text-center">
        <p v-if="attrs.signerName" class="text-xs font-medium text-muted-foreground">
          {{ attrs.signerName }}
        </p>
        <p v-if="attrs.signedAt" class="text-xs text-muted-foreground">
          {{ formatDate(attrs.signedAt) }}
        </p>
      </div>

      <!-- Horizontal placement. Dragging the signature sideways is the precise
           control; these three are the quick presets, and picking one clears a
           dragged offset so the letter snaps back to a clean alignment. -->
      <div class="mt-1 flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          class="size-7"
          :class="attrs.offsetX === null && attrs.align === 'left' && 'bg-muted text-foreground'"
          :aria-label="'Align left'"
          :aria-pressed="attrs.offsetX === null && attrs.align === 'left'"
          @click="setAlign('left')"
        >
          <AlignLeftIcon class="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="size-7"
          :class="attrs.offsetX === null && attrs.align === 'center' && 'bg-muted text-foreground'"
          :aria-label="'Align center'"
          :aria-pressed="attrs.offsetX === null && attrs.align === 'center'"
          @click="setAlign('center')"
        >
          <AlignCenterIcon class="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="size-7"
          :class="attrs.offsetX === null && attrs.align === 'right' && 'bg-muted text-foreground'"
          :aria-label="'Align right'"
          :aria-pressed="attrs.offsetX === null && attrs.align === 'right'"
          @click="setAlign('right')"
        >
          <AlignRightIcon class="size-3.5" />
        </Button>
        <span class="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <Button variant="outline" size="sm" class="h-7 gap-1.5 px-2.5 text-xs" @click="dialogOpen = true">
          <RefreshCwIcon class="size-3.5" />
          Replace
        </Button>
        <Button variant="ghost" size="sm" class="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-destructive" @click="clear">
          <EraserIcon class="size-3.5" />
          Clear
        </Button>
      </div>
    </div>

    <SignatureCaptureDialog
      v-if="dialogOpen"
      :initial-name="attrs.signerName ?? undefined"
      @close="dialogOpen = false"
      @signed="onSigned"
    />
  </NodeViewWrapper>
</template>
