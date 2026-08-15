<script setup lang="ts">
import { DownloadIcon, ExternalLinkIcon, XIcon } from '@lucide/vue'
import type { Component } from 'vue'
import type { DocumentPreview } from '~/composables/useDocumentExport'

defineProps<{
  preview: DocumentPreview
  typeIcon: Component
  typeLabel: string
}>()

const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div class="flex items-center justify-between gap-3 border-b px-3 py-2.5">
    <div class="flex min-w-0 items-center gap-2.5">
      <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <component :is="typeIcon" class="size-4 text-primary" />
      </span>
      <div class="min-w-0">
        <p class="truncate text-sm font-medium leading-tight">{{ preview.title }}</p>
        <p class="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {{ typeLabel }}
        </p>
      </div>
    </div>

    <div class="flex shrink-0 items-center gap-1">
      <a
        v-if="preview.blobUrl"
        :href="preview.blobUrl"
        target="_blank"
        rel="noopener"
        class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Open in new tab"
        aria-label="Open in new tab"
      >
        <ExternalLinkIcon class="size-4" />
      </a>
      <a
        v-if="preview.blobUrl"
        :href="preview.blobUrl"
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
</template>