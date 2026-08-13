<script setup lang="ts">
import { Loader2Icon } from '@lucide/vue'

/**
 * Renders a Word document inline via docx-preview.
 *
 * The export preview panels hold Word files as blob: URLs (the API's bearer
 * token would not survive an iframe, so the composable fetches and blobs
 * them). This component fetches that blob back and hands it to docx-preview,
 * which paints the document's pages into the container.
 */
const props = defineProps<{ blobUrl: string }>()

const container = ref<HTMLElement | null>(null)
const loading = ref(false)
const error = ref('')
const rendered = ref(false)

async function render() {
  if (rendered.value) return

  loading.value = true
  error.value = ''
  try {
    const blob = await fetch(props.blobUrl).then((response) => response.blob())
    await nextTick()
    const el = container.value
    if (!el) throw new Error('Preview container not ready')
    const { renderAsync } = await import('docx-preview')
    await renderAsync(blob, el)
    rendered.value = true
  } catch (err: any) {
    error.value = err?.message ?? 'Could not render the document.'
  } finally {
    loading.value = false
  }
}

watch(
  () => props.blobUrl,
  () => {
    rendered.value = false
    if (container.value) container.value.innerHTML = ''
    void render()
  },
  { immediate: true },
)
</script>

<template>
  <div class="relative min-h-0 flex-1 overflow-auto">
    <div ref="container" class="p-4" />
    <div
      v-if="loading"
      class="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-background text-sm text-muted-foreground"
    >
      <Loader2Icon class="size-4 animate-spin" />
      Loading…
    </div>
    <div
      v-else-if="error"
      class="absolute inset-0 z-10 flex items-center justify-center bg-background p-6 text-center text-sm text-destructive"
    >
      {{ error }}
    </div>
  </div>
</template>