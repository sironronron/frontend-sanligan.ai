<script setup lang="ts">
import { FilePlus2Icon, FileSearchIcon, Loader2Icon } from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import type { VettingRequestRecord } from '~/types/vetting'
import { timeAgo } from '~/utils/time'

definePageMeta({
  middleware: ['subscription'],
  layout: 'default',
})

const api = useApi()
const route = useRoute()

const requests = ref<VettingRequestRecord[]>([])
const loading = ref(true)

/**
 * /vetting/new and /vetting/:id are nested pages, so the list has to step
 * aside and let <NuxtPage /> render them once the route leaves the index.
 */
const isChild = computed(() => route.path !== '/vetting')

const statusTone: Record<string, string> = {
  payment_pending: 'bg-muted text-muted-foreground',
  pending: 'bg-muted text-muted-foreground',
  waiting: 'bg-muted text-muted-foreground',
  matched: 'bg-primary/10 text-primary',
  accepted: 'bg-forest/10 text-forest dark:bg-cream/10 dark:text-peach',
  under_review: 'bg-espresso/10 text-espresso dark:bg-cream/10 dark:text-peach',
  vetted: 'bg-primary/10 text-primary',
  notarized: 'bg-forest/10 text-forest dark:bg-cream/10 dark:text-peach',
  completed: 'bg-forest/10 text-forest dark:bg-cream/10 dark:text-peach',
  cancelled: 'bg-muted text-muted-foreground',
  declined: 'bg-destructive/10 text-destructive',
}

onMounted(async () => {
  try {
    const res = await api<{ data: VettingRequestRecord[] }>('/vetting-requests')
    requests.value = res.data
  } catch {
    toast.error('Could not load your requests.')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <div v-if="!isChild" class="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
    <PageHeader title="Document vetting" description="Have a Philippine lawyer review and notarize your documents.">
      <template #actions>
        <Button class="gap-2" @click="navigateTo('/vetting/new')">
          <FilePlus2Icon class="size-4" />
          New request
        </Button>
      </template>
    </PageHeader>

    <ListSkeleton v-if="loading" :rows="4" />

    <EmptyState
      v-else-if="requests.length === 0"
      :icon="FileSearchIcon"
      title="No requests yet"
      description="Upload a document to have a verified lawyer review it, and notarize it if you need a notarial act."
    >
      <Button @click="navigateTo('/vetting/new')">Start a request</Button>
    </EmptyState>

    <div v-else class="space-y-2">
      <div
        v-for="r in requests"
        :key="r.id"
        class="surface-interactive group flex cursor-pointer items-center gap-4 p-4"
        @click="navigateTo(`/vetting/${r.id}`)"
      >
        <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileSearchIcon class="size-5" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">{{ r.document_type }}</p>
          <p class="mt-0.5 truncate text-xs text-muted-foreground">
            {{ r.service_type_label }} · {{ r.assigned_lawyer?.name ?? 'Looking for a lawyer…' }} · {{ timeAgo(r.created_at) }}
          </p>
        </div>
        <Badge :class="statusTone[r.status] ?? 'bg-muted text-muted-foreground'" class="shrink-0">
          {{ r.status_label }}
        </Badge>
        <Loader2Icon v-if="r.status === 'payment_pending'" class="size-4 animate-spin text-muted-foreground" />
      </div>
    </div>
    </div>

    <NuxtPage />
  </div>
</template>