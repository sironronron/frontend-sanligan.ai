<script setup lang="ts">
import { CheckIcon, Loader2Icon, PenLineIcon, TypeIcon, UploadIcon, XIcon } from '@lucide/vue'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import type { SignedSignature } from '~/types/tiptap'

const emit = defineEmits<{
  close: []
  signed: [signature: SignedSignature]
}>()

const props = defineProps<{
  initialName?: string
}>()

const auth = useAuthStore()

/**
 * Rendered as a modal reka-ui Dialog rather than a hand-rolled overlay so it
 * registers as a dismissable layer: while it is open it is the highest layer,
 * which suspends pointer events on the letter sheet underneath and stops the
 * sheet's DismissableLayer from closing on the first pointer-down (drawing
 * happens outside the sheet's subtree, in this teleported dialog).
 */
const open = ref(true)

function closeDialog() {
  open.value = false
}

watch(open, (isOpen) => {
  if (!isOpen) emit('close')
})

type Mode = 'draw' | 'type' | 'upload'

const mode = ref<Mode>('draw')
const signerName = ref('')
const busy = ref(false)

const CANVAS_WIDTH = 720
const CANVAS_HEIGHT = 240

const canvasEl = ref<HTMLCanvasElement | null>(null)
const typedInput = ref<HTMLInputElement | null>(null)

/** True once a stroke (or drawn/typed/uploaded image) exists. */
const hasSignature = ref(false)

interface Point {
  x: number
  y: number
}

const strokes = ref<Point[][]>([])
let activeStroke: Point[] | null = null

const color = ref('#000000')

function canvasContext() {
  const ctx = canvasEl.value?.getContext('2d')
  return ctx ?? null
}

function syncColor() {
  color.value = '#000000'
}

/** Signature strokes are 3px; a ~10% bump keeps the ink legible when scaled. */
const INK_WIDTH = 3.3

function redraw() {
  const canvas = canvasEl.value
  const ctx = canvasContext()
  if (!canvas || !ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.lineWidth = INK_WIDTH
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = color.value
  ctx.fillStyle = color.value

  for (const stroke of strokes.value) {
    if (stroke.length === 0) continue

    const start = stroke[0]
    if (!start) continue

    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    for (let i = 1; i < stroke.length; i++) {
      const point = stroke[i]
      if (point) ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
  }
}

function pointFromEvent(event: PointerEvent): Point {
  const rect = canvasEl.value!.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
  }
}

function onPointerDown(event: PointerEvent) {
  if (!canvasEl.value) return
  event.preventDefault()
  canvasEl.value.setPointerCapture(event.pointerId)
  activeStroke = [pointFromEvent(event)]
  strokes.value.push(activeStroke)
  hasSignature.value = true
}

function onPointerMove(event: PointerEvent) {
  if (!activeStroke) return
  const point = pointFromEvent(event)
  activeStroke.push(point)

  const ctx = canvasContext()
  if (!ctx || activeStroke.length < 2) return

  const from = activeStroke[activeStroke.length - 2]
  const to = point
  if (!from) return
  ctx.lineWidth = INK_WIDTH
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = color.value
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
}

function endStroke() {
  activeStroke = null
}

function clearCanvas() {
  strokes.value = []
  hasSignature.value = false
  const canvas = canvasEl.value
  canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
}

/** Render typed text into the canvas, sized down to fit, in a cursive script. */
async function renderTyped(text: string) {
  const canvas = canvasEl.value
  const ctx = canvasContext()
  if (!canvas || !ctx) return

  await document.fonts.ready

  canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)

  const family = '"Dancing Script", "Segoe Script", cursive'
  let fontSize = 120
  let metrics: TextMetrics

  ctx.font = `700 ${fontSize}px ${family}`
  metrics = ctx.measureText(text)

  // Shrink until the text fits comfortably inside the canvas, then centre it
  // vertically on the baseline so the visible signature sits mid-block.
  while (metrics.width > canvas.width - 32 && fontSize > 24) {
    fontSize -= 8
    ctx.font = `700 ${fontSize}px ${family}`
    metrics = ctx.measureText(text)
  }

  ctx.fillStyle = color.value
  ctx.textBaseline = 'middle'
  const x = (canvas.width - metrics.width) / 2
  const y = canvas.height / 2
  ctx.fillText(text, x, y)

  // A light stroke over the filled text thickens the cursive render by ~10%
  // so the typed signature carries the same weight as a drawn one.
  ctx.lineWidth = 1.5
  ctx.lineJoin = 'round'
  ctx.strokeStyle = color.value
  ctx.strokeText(text, x, y)

  hasSignature.value = true
}

async function uploadImage(file: File) {
  const canvas = canvasEl.value
  const ctx = canvasContext()
  if (!canvas || !ctx) return

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read the image'))
    reader.readAsDataURL(file)
  })

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('The file is not a readable image'))
    img.src = dataUrl
  })

  // Normalize to PNG at the canvas resolution, fitting the image inside the
  // box and preserving its aspect ratio — the exported file then never cares
  // what format the upload arrived in.
  const scale = Math.min(canvas.width / image.width, canvas.height / image.height, 1)
  const width = Math.round(image.width * scale)
  const height = Math.round(image.height * scale)

  canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)

  hasSignature.value = true
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  void uploadImage(file)
}

function useSignature() {
  const canvas = canvasEl.value
  if (!canvas || !hasSignature.value) return

  const src = canvas.toDataURL('image/png')

  open.value = false
  emit('signed', {
    src,
    signedAt: new Date().toISOString(),
    signerName: signerName.value.trim() || (auth.user?.name ?? ''),
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
  })
}

onMounted(() => {
  syncColor()
  signerName.value = props.initialName?.trim() || (auth.user?.name ?? '')
})

watch(mode, (next) => {
  // Pre-render the current name when the user switches to Type, so the
  // cursive preview is never an empty box they have to re-trigger.
  if (next === 'type' && signerName.value.trim()) {
    void renderTyped(signerName.value)
  }
})

onBeforeUnmount(() => {
  // Keep the keyboard from being trapped behind a closing dialog.
  document.activeElement instanceof HTMLElement && document.activeElement.blur()
})
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay
        class="fixed inset-0 z-[120] backdrop-blur-sm"
        style="background: rgb(0 0 0 / 0.45)"
      />
      <DialogContent
        class="surface fixed left-1/2 top-1/2 z-[120] flex max-h-[90dvh] w-full max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden outline-none"
      >
        <div class="flex items-start gap-3 border-b px-5 py-3.5">
          <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <PenLineIcon class="size-4 text-primary" />
          </div>
          <div class="min-w-0 flex-1">
            <DialogTitle class="text-sm font-medium">Add your signature</DialogTitle>
            <DialogDescription class="mt-0.5 text-xs text-muted-foreground">
              Draw it, type it, or upload a saved image.
            </DialogDescription>
          </div>
          <DialogClose as-child>
            <Button variant="ghost" size="icon" class="size-7 shrink-0" aria-label="Close">
              <XIcon class="size-4" />
            </Button>
          </DialogClose>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div class="flex items-center gap-1 rounded-lg bg-muted p-1">
            <button
              v-for="tab in ([
                { key: 'draw', label: 'Draw', icon: PenLineIcon },
                { key: 'type', label: 'Type', icon: TypeIcon },
                { key: 'upload', label: 'Upload', icon: UploadIcon },
              ] as const)"
              :key="tab.key"
              type="button"
              class="flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              :class="mode === tab.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
              :aria-pressed="mode === tab.key"
              @click="mode = tab.key"
            >
              <component :is="tab.icon" class="size-3.5" />
              {{ tab.label }}
            </button>
          </div>

          <div class="mt-4">
            <!--
              One canvas is shared by all three modes: drawing writes strokes
              directly, typing and uploading render into it. That keeps the
              confirm step (canvas -> data URL) identical for every input.
            -->
            <canvas
              v-show="mode !== 'type'"
              ref="canvasEl"
              class="w-full cursor-crosshair touch-none rounded-lg border border-border bg-background"
              :width="CANVAS_WIDTH"
              :height="CANVAS_HEIGHT"
              :style="{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }"
              @pointerdown="mode === 'draw' && onPointerDown($event)"
              @pointermove="onPointerMove($event)"
              @pointerup="endStroke"
              @pointercancel="endStroke"
            />

            <div v-if="mode === 'type'" class="rounded-lg border border-border bg-background">
              <input
                ref="typedInput"
                v-model="signerName"
                type="text"
                maxlength="80"
                class="w-full border-0 bg-transparent px-4 py-3 text-center font-['Dancing_Script'] text-4xl font-bold outline-none placeholder:text-muted-foreground/50"
                placeholder="Type your name…"
                @input="renderTyped(signerName)"
              >
              <p class="border-t px-4 py-2 text-center text-xs text-muted-foreground">
                The name is rendered in a cursive script.
              </p>
            </div>

            <div v-if="mode === 'upload'" class="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-center">
              <label class="flex cursor-pointer flex-col items-center gap-2">
                <UploadIcon class="size-5 text-muted-foreground" />
                <span class="text-sm font-medium">Choose a signature image</span>
                <span class="text-xs text-muted-foreground">PNG, JPG, or WebP</span>
                <input type="file" accept="image/*" class="hidden" @change="onFileChange" />
              </label>
            </div>

            <div class="mt-4 flex items-end gap-3">
              <div class="min-w-0 flex-1">
                <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Signer name
                </label>
                <Input v-model="signerName" class="mt-1.5" placeholder="Full name" />
              </div>
              <Button
                variant="outline"
                size="sm"
                class="shrink-0"
                :disabled="!hasSignature"
                @click="clearCanvas"
              >
                Clear
              </Button>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 border-t px-5 py-3.5">
          <Button variant="ghost" @click="closeDialog">
            Cancel
          </Button>
          <Button :disabled="!hasSignature || busy" class="gap-1.5" @click="useSignature">
            <Loader2Icon v-if="busy" class="size-4 animate-spin" />
            <CheckIcon v-else class="size-4" />
            Use signature
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>