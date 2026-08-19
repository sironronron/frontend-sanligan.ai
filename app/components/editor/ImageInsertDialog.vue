<script setup lang="ts">
import { ImageIcon, Loader2Icon, XIcon } from '@lucide/vue'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { ref, watch } from 'vue'
import { decodeImageSize } from '~/utils/imageUrl'

const emit = defineEmits<{
  close: []
  insert: [attrs: { src: string; alt?: string; title?: string; width?: number | null; height?: number | null }]
}>()

const open = ref(true)

function closeDialog() {
  open.value = false
}

watch(open, (isOpen) => {
  if (!isOpen) emit('close')
})

const mode = ref<'url' | 'upload'>('url')
const url = ref('')
const alt = ref('')
const fileEl = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const error = ref('')

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Unable to read that file.'))
    reader.readAsDataURL(file)
  })
}

function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    error.value = 'That file is not an image.'
    return
  }

  busy.value = true
  error.value = ''

  fileToDataUrl(file)
    .then((src) => {
      url.value = src
      error.value = ''
    })
    .catch((err: unknown) => {
      error.value = err instanceof Error ? err.message : 'Unable to read that file.'
    })
    .finally(() => {
      busy.value = false
    })
}

async function confirm() {
  const src = url.value.trim()
  if (!src) return

  busy.value = true
  error.value = ''

  try {
    const { width, height } = await decodeImageSize(src)
    emit('insert', {
      src,
      alt: alt.value.trim() || undefined,
      width,
      height,
    })
    closeDialog()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to load that image.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
      <DialogContent
        class="surface fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-5 shadow-2xl outline-none"
      >
        <DialogTitle class="flex items-center gap-2 text-base font-semibold">
          <ImageIcon class="size-4" />
          Insert image
        </DialogTitle>
        <DialogDescription class="sr-only">Choose an image for the letter.</DialogDescription>

        <div class="mt-4 flex gap-1 rounded-lg bg-muted/60 p-1">
          <button
            type="button"
            class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
            :class="mode === 'url' ? 'bg-background shadow-sm' : 'text-muted-foreground'"
            @click="mode = 'url'"
          >
            From URL
          </button>
          <button
            type="button"
            class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
            :class="mode === 'upload' ? 'bg-background shadow-sm' : 'text-muted-foreground'"
            @click="mode = 'upload'"
          >
            Upload
          </button>
        </div>

        <div v-if="mode === 'url'" class="mt-4 space-y-3">
          <label class="block">
            <span class="text-xs font-medium text-muted-foreground">Image URL</span>
            <Input v-model="url" class="mt-1" placeholder="https://…" @keydown.enter="confirm" />
          </label>
          <label class="block">
            <span class="text-xs font-medium text-muted-foreground">Alt text</span>
            <Input v-model="alt" class="mt-1" placeholder="Describe the image" />
          </label>
        </div>

        <div v-else class="mt-4">
          <input ref="fileEl" type="file" accept="image/*" class="hidden" @change="onFileChange" />
          <button
            type="button"
            class="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            @click="fileEl?.click()"
          >
            <ImageIcon class="size-5" />
            Click to choose an image
          </button>
        </div>

        <p v-if="error" class="mt-3 text-sm text-destructive">{{ error }}</p>

        <div class="mt-5 flex justify-end gap-2">
          <DialogClose as-child>
            <Button variant="outline" size="sm">
              <XIcon class="size-3.5" />
              Cancel
            </Button>
          </DialogClose>
          <Button
            size="sm"
            :disabled="busy || url.trim() === ''"
            @click="confirm"
          >
            <Loader2Icon v-if="busy" class="size-3.5 animate-spin" />
            <template v-else>Insert</template>
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>