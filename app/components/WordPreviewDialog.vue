<script setup lang="ts">
import { DownloadIcon, ExternalLinkIcon, FileTypeIcon, Loader2Icon, XIcon } from '@lucide/vue'

/**
 * Word documents open in a centered dialog rather than the narrow side panel:
 * docx-preview paints pages at their real size, so a 28rem rail squashes the
 * text and scrolls horizontally. The dialog gives the pages room and keeps the
 * scroll inside its own scrollbox, so the layout around it never moves.
 */
const props = defineProps<{
  title: string
  blobUrl: string | null
  loading: boolean
  error: string
}>()

const emit = defineEmits<{ close: [] }>()

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6"
      style="background: rgb(0 0 0 / 0.45)"
      role="dialog"
      aria-modal="true"
      :aria-label="`Preview ${title}`"
      @click.self="emit('close')"
    >
      <div class="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div class="flex items-center justify-between gap-3 border-b px-3 py-2.5">
          <div class="flex min-w-0 items-center gap-2.5">
            <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <FileTypeIcon class="size-4 text-primary" />
            </span>
            <div class="min-w-0">
              <p class="truncate text-sm font-medium leading-tight">{{ title }}</p>
              <p class="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Word document
              </p>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <a
              v-if="blobUrl"
              :href="blobUrl"
              target="_blank"
              rel="noopener"
              class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Open in new tab"
              aria-label="Open in new tab"
            >
              <ExternalLinkIcon class="size-4" />
            </a>
            <a
              v-if="blobUrl"
              :href="blobUrl"
              download
              class="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <DownloadIcon class="size-3.5" />
              Download
            </a>
            <Button variant="ghost" size="icon" class="size-7" aria-label="Close preview" @click="emit('close')">
              <XIcon class="size-4" />
            </Button>
          </div>
        </div>

        <div
          v-if="loading"
          class="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center"
        >
          <span class="relative flex size-10 items-center justify-center">
            <span class="absolute size-full animate-ping rounded-full bg-primary/10" />
            <Loader2Icon class="size-5 animate-spin text-primary" />
          </span>
          <div>
            <p class="text-sm font-medium">Preparing your word document…</p>
            <p class="mt-0.5 text-xs text-muted-foreground">This usually takes a few seconds.</p>
          </div>
        </div>

        <p v-else-if="error" class="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center text-sm text-destructive">
          <span>{{ error }}</span>
          <Button variant="outline" size="sm" class="h-7 gap-1.5 text-xs" @click="emit('close')">
            Close
          </Button>
        </p>

        <DocxViewer v-else-if="blobUrl" :blob-url="blobUrl" />

        <div
          v-else
          class="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center text-sm text-muted-foreground"
        >
          <span>Word documents cannot be previewed inline.</span>
          <a
            :href="blobUrl ?? undefined"
            download
            class="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <DownloadIcon class="size-3.5" />
            Download Word document
          </a>
        </div>
      </div>
    </div>
  </Teleport>
</template>