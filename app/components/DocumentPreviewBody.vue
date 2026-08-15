<script setup lang="ts">
import { DownloadIcon, Loader2Icon } from '@lucide/vue'
import type { DocumentPreview } from '~/composables/useDocumentExport'

defineProps<{
  preview: DocumentPreview
  typeLabel: string
}>()

const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div v-if="preview.loading" class="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
    <span class="relative flex size-10 items-center justify-center">
      <span class="absolute size-full animate-ping rounded-full bg-primary/10" />
      <Loader2Icon class="size-5 animate-spin text-primary" />
    </span>
    <div>
      <p class="text-sm font-medium">Preparing your {{ typeLabel.toLowerCase() }}…</p>
      <p class="mt-0.5 text-xs text-muted-foreground">This usually takes a few seconds.</p>
    </div>
  </div>

  <div
    v-else-if="preview.error"
    class="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
  >
    <p class="text-sm font-medium text-destructive">{{ preview.error }}</p>
    <Button variant="outline" size="sm" class="h-7 gap-1.5 text-xs" @click="emit('close')">
      Close
    </Button>
  </div>

  <iframe
    v-else-if="preview.type === 'pdf'"
    :src="preview.blobUrl ?? undefined"
    class="w-full flex-1 border-0"
    :title="`Preview of ${preview.title}`"
  />

  <div v-else class="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
    <span>Document could not be previewed.</span>
    <a
      :href="preview.blobUrl ?? undefined"
      download
      class="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
    >
      <DownloadIcon class="size-3.5" />
      Download
    </a>
  </div>
</template>