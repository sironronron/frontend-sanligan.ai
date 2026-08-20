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
    <PageHeader title="Document vetting" :icon="FileSearchIcon" description="Have a Philippine lawyer review and notarize your documents.">
      <template #actions>
        <Button class="bg-brand-gradient gap-2 border-0 text-primary-foreground shadow-sm transition-opacity hover:opacity-90" @click="navigateTo('/vetting/new')">
          <FilePlus2Icon class="size-4" />
          New request
        </Button>
      </template>
    </PageHeader>

    <ListSkeleton v-if="loading" :rows="4" />

    <EmptyState
      v-else-if="requests.length === 0"
      class="hero-gradient"
      :icon="FileSearchIcon"
      title="No requests yet"
      description="Upload a document to have a verified lawyer review it, and notarize it if you need a notarial act."
    >
      <Button class="bg-brand-gradient border-0 text-primary-foreground shadow-sm transition-opacity hover:opacity-90" @click="navigateTo('/vetting/new')">Start a request</Button>
    </EmptyState>

    <div v-else class="space-y-2">
      <div
        v-for="(r, i) in requests"
        :key="r.id"
        class="batayan-row-in surface-interactive group flex cursor-pointer items-center gap-4 p-4"
        :style="{ '--row-delay': `${i * 40}ms` }"
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
        <StatusBadge :status="r.status" :label="r.status_label" class="shrink-0" />
        <Loader2Icon v-if="r.status === 'payment_pending'" class="size-4 animate-spin text-muted-foreground" />
      </div>
    </div>
    </div>

    <NuxtPage />
  </div>
</template>