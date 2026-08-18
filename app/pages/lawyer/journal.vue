<script setup lang="ts">
import { BookOpenTextIcon, ArrowLeftIcon } from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import type { JournalEntry } from '~/types/vetting'

definePageMeta({
  middleware: ['lawyer'],
  layout: 'default',
})

const api = useApi()

const entries = ref<JournalEntry[]>([])
const loading = ref(true)

function formatDate(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

onMounted(async () => {
  try {
    const res = await api<{ data: JournalEntry[] }>('/lawyer/journal')
    entries.value = res.data
  } catch {
    toast.error('Could not load your journal.')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
    <NuxtLink to="/lawyer/dashboard" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeftIcon class="size-3.5" />
      Back to workspace
    </NuxtLink>

    <PageHeader
      title="Notarial journal"
      description="The official register of every notarial act you have performed."
    />

    <ListSkeleton v-if="loading" :rows="4" />

    <EmptyState
      v-else-if="entries.length === 0"
      :icon="BookOpenTextIcon"
      title="No notarial acts yet"
      description="Each notarization you complete is recorded here with its certificate number."
    />

    <div v-else class="space-y-2">
      <div v-for="e in entries" :key="e.id" class="surface-interactive p-4">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p class="text-sm font-medium">{{ e.signer_name }}</p>
          <Badge variant="secondary" class="shrink-0">{{ e.document_type }}</Badge>
          <Badge variant="outline" class="shrink-0 text-muted-foreground">{{ e.certificate_number }}</Badge>
        </div>
        <p class="mt-1.5 text-xs text-muted-foreground">
          ID {{ e.id_type }} · {{ e.id_number }} · {{ e.verification_method ?? 'video' }} verification
          <span class="mx-1">·</span>
          {{ formatDate(e.notarized_at) }}
        </p>
      </div>
    </div>
  </div>
</template>