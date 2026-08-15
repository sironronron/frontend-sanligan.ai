<script setup lang="ts">
import { Loader2Icon } from '@lucide/vue'

const api = useApi()

const document = ref('')
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    const response = await api<{ content: string; hash: string; version: string }>('/terms/document')
    document.value = response.content
  } catch (e) {
    error.value = 'Failed to load terms document. Please try again.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="min-h-screen bg-background">
    <div class="max-w-4xl mx-auto py-12 px-4">
      <div class="surface p-8">
        <div
          v-if="loading"
          class="flex items-center justify-center py-12"
        >
          <Loader2Icon class="h-6 w-6 animate-spin text-primary" />
        </div>

        <div
          v-else-if="error"
          class="text-center py-12"
        >
          <p class="text-sm text-destructive">{{ error }}</p>
        </div>

        <template v-else>
          <div
            class="markdown-body max-w-none"
            v-html="renderMarkdown(document)"
          />
        </template>
      </div>
    </div>
  </div>
</template>
