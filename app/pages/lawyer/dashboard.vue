<script setup lang="ts">
import {
  ArrowRightIcon,
  BookOpenTextIcon,
  CircleCheckIcon,
  FileSearchIcon,
  Loader2Icon,
  ScaleIcon,
} from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import type { VettingRequestRecord } from '~/types/vetting'
import { timeAgo } from '~/utils/time'

definePageMeta({
  middleware: ['lawyer'],
  layout: 'default',
})

const api = useApi()
const auth = useAuthStore()

const loading = ref(true)
const toggling = ref(false)
const requests = ref<VettingRequestRecord[]>([])

const offered = computed(() =>
  requests.value.filter(
    (r) => r.status === 'matched' && r.my_match !== null && r.assigned_lawyer?.id !== auth.user?.id,
  ),
)

const active = computed(() =>
  requests.value.filter((r) => ['accepted', 'under_review', 'vetted', 'notarized'].includes(r.status)),
)

const completed = computed(() => requests.value.filter((r) => ['completed', 'cancelled', 'declined'].includes(r.status)))

const available = ref(auth.user?.lawyer_profile?.available ?? false)

async function loadRequests() {
  loading.value = true
  try {
    const res = await api<{ data: VettingRequestRecord[] }>('/lawyer/vetting-requests')
    requests.value = res.data
  } catch {
    toast.error('Could not load your requests.')
  } finally {
    loading.value = false
  }
}

async function toggleAvailability() {
  if (toggling.value) return
  toggling.value = true
  try {
    await api('/lawyer/profile/availability', {
      method: 'PATCH',
      body: { available: !available.value },
    })
    available.value = !available.value
    await auth.fetchUser()
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not update your availability.')
  } finally {
    toggling.value = false
  }
}

onMounted(() => {
  void loadRequests()
})
</script>

<template>
  <div class="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
    <PageHeader title="Lawyer workspace" description="Requests offered to you, your active matters, and your notarial journal.">
      <template #actions>
        <Button
          variant="outline"
          class="gap-2"
          :class="available ? 'border-forest/40 bg-forest/5 text-forest hover:bg-forest/10 hover:text-forest dark:border-peach/40 dark:bg-peach/10 dark:text-peach dark:hover:bg-peach/20 dark:hover:text-peach' : ''"
          :disabled="toggling"
          data-tour="lawyer-availability"
          @click="toggleAvailability"
        >
          <Loader2Icon v-if="toggling" class="size-4 animate-spin" />
          <CircleCheckIcon v-else class="size-4" :class="available ? 'text-forest dark:text-peach' : 'text-muted-foreground'" />
          {{ available ? 'Now available for work' : "You're not accepting any requests as of the moment" }}
        </Button>
        <Button variant="outline" class="gap-2" data-tour="lawyer-journal" @click="navigateTo('/lawyer/journal')">
          <BookOpenTextIcon class="size-4" />
          Notarial journal
        </Button>
      </template>
    </PageHeader>

    <ListSkeleton v-if="loading" :rows="4" />

    <template v-else>
      <section v-if="offered.length > 0" class="mb-8">
        <h2 class="mb-3 text-sm font-medium text-muted-foreground" data-tour="lawyer-offered">
          Incoming requests ({{ offered.length }})
        </h2>
        <div class="space-y-2">
          <div
            v-for="r in offered"
            :key="r.id"
            class="surface-interactive group flex cursor-pointer items-center gap-4 p-4"
            @click="navigateTo(`/lawyer/requests/${r.id}`)"
          >
            <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileSearchIcon class="size-5" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ r.document_type }} · {{ r.summary }}</p>
              <p class="mt-0.5 truncate text-xs text-muted-foreground">
                {{ r.service_type_label }} · {{ r.urgency_label }} · {{ timeAgo(r.created_at) }}
              </p>
            </div>
            <Badge variant="secondary" class="shrink-0">Offered</Badge>
            <ArrowRightIcon class="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </section>

      <section class="mb-8">
        <h2 class="mb-3 text-sm font-medium text-muted-foreground" data-tour="lawyer-active">
          Active requests ({{ active.length }})
        </h2>

        <div v-if="active.length === 0" class="space-y-2">
          <EmptyState
            :icon="ScaleIcon"
            title="No active requests"
            :description="offered.length > 0 ? 'Review an incoming request above to start.' : 'You will be matched with document requests as they come in. Keep your availability on to receive them.'"
          />
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="r in active"
            :key="r.id"
            class="surface-interactive group flex cursor-pointer items-center gap-4 p-4"
            @click="navigateTo(`/lawyer/requests/${r.id}`)"
          >
            <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-forest/10 text-forest">
              <ScaleIcon class="size-5" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ r.document_type }} · {{ r.summary }}</p>
              <p class="mt-0.5 truncate text-xs text-muted-foreground">
                {{ r.submitter?.name ?? '—' }} · {{ r.status_label }} · {{ timeAgo(r.created_at) }}
              </p>
            </div>
            <Badge variant="secondary" class="shrink-0">{{ r.status_label }}</Badge>
            <ArrowRightIcon class="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </section>

      <section v-if="completed.length > 0">
        <h2 class="mb-3 text-sm font-medium text-muted-foreground">Recent history ({{ completed.length }})</h2>
        <div class="space-y-2">
          <div v-for="r in completed" :key="r.id" class="surface-interactive flex items-center gap-4 p-4 opacity-80">
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ r.document_type }} · {{ r.summary }}</p>
              <p class="mt-0.5 truncate text-xs text-muted-foreground">
                {{ r.status_label }} · {{ timeAgo(r.created_at) }}
              </p>
            </div>
            <Badge variant="secondary" class="shrink-0">{{ r.status_label }}</Badge>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>