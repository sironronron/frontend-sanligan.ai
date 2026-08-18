<script setup lang="ts">
import { DownloadIcon, EyeIcon, FolderInputIcon, LinkIcon, Loader2Icon, RotateCcwIcon, TrashIcon } from '@lucide/vue'

/**
 * The button cluster on an uploaded document: view, download or retry, attach
 * to a case, delete.
 *
 * Extracted so the documents page can draw the same set of actions in a row,
 * on a card, and in a table cell without the three layouts drifting apart —
 * an action added here shows up in all of them.
 */
const props = withDefaults(defineProps<{
  document: {
    id: string
    title: string
    original_filename: string
    status: 'queued' | 'processing' | 'ready' | 'failed'
  }
  /** True while the attach panel for this document is open. */
  attaching?: boolean
  /** True while a reprocess request for this document is in flight. */
  retrying?: boolean
  /** Tighter buttons, for the table's actions column. */
  compact?: boolean
}>(), {
  attaching: false,
  retrying: false,
  compact: false,
})

const emit = defineEmits<{
  view: []
  download: []
  retry: []
  toggleAttach: []
  toggleFile: []
  remove: []
}>()

const failed = computed(() => props.document.status === 'failed')
const sizeClass = computed(() => (props.compact ? 'size-7' : 'size-9'))
const iconClass = computed(() => (props.compact ? 'size-3.5' : 'size-4'))
</script>

<template>
  <div class="flex shrink-0 items-center" :class="compact ? 'gap-0.5' : 'gap-0'">
    <Button
      variant="ghost"
      size="icon"
      :class="[sizeClass, 'text-muted-foreground hover:text-foreground']"
      :aria-label="`View ${document.title}`"
      @click="emit('view')"
    >
      <EyeIcon :class="iconClass" />
    </Button>

    <!-- A failed document has no file worth fetching; it gets a retry instead. -->
    <Button
      v-if="!failed"
      variant="ghost"
      size="icon"
      :class="[sizeClass, 'text-muted-foreground hover:text-foreground']"
      :aria-label="`Download ${document.title}`"
      @click="emit('download')"
    >
      <DownloadIcon :class="iconClass" />
    </Button>
    <Button
      v-else
      variant="ghost"
      size="icon"
      :class="[sizeClass, 'text-muted-foreground hover:text-foreground']"
      :aria-label="`Retry ${document.title}`"
      :disabled="retrying"
      @click="emit('retry')"
    >
      <Loader2Icon v-if="retrying" :class="[iconClass, 'animate-spin']" />
      <RotateCcwIcon v-else :class="iconClass" />
    </Button>

    <Button
      variant="ghost"
      size="icon"
      :class="[sizeClass, 'text-muted-foreground hover:text-foreground']"
      :aria-label="`File ${document.title} under a folder`"
      @click="emit('toggleFile')"
    >
      <FolderInputIcon :class="iconClass" />
    </Button>

    <Button
      variant="ghost"
      size="icon"
      :class="[sizeClass, 'text-muted-foreground hover:text-foreground', attaching ? 'bg-accent text-foreground' : '']"
      :aria-label="`Attach ${document.title} to a case`"
      @click="emit('toggleAttach')"
    >
      <LinkIcon :class="iconClass" />
    </Button>

    <Button
      v-if="!failed"
      variant="ghost"
      size="icon"
      :class="[sizeClass, 'text-muted-foreground hover:text-destructive']"
      :aria-label="`Delete ${document.title}`"
      @click="emit('remove')"
    >
      <TrashIcon :class="iconClass" />
    </Button>
  </div>
</template>
