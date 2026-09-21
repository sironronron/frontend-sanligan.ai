<script setup lang="ts">
import { ArchiveIcon, BriefcaseBusinessIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, RefreshCwIcon, SearchIcon, UserRoundIcon } from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import type { Client, ClientInput, ClientLifecycle, ClientType } from '~/types/client'

definePageMeta({ middleware: ['auth', 'onboarding', 'subscription', 'terms'] })

const store = useClientStore()
const router = useRouter()
const search = ref('')
const type = ref<'all' | ClientType>('all')
const lifecycle = ref<'all' | ClientLifecycle>('all')
const archived = ref(false)
const page = ref(1)
const showForm = ref(false)
const saving = ref(false)
const accessState = ref<'ready' | 'unauthorized' | 'forbidden' | 'error'>('ready')
let timer: ReturnType<typeof setTimeout> | undefined

const isFiltered = computed(() => !!search.value.trim() || type.value !== 'all' || lifecycle.value !== 'all')
const summary = computed(() => `${store.pagination.total} ${archived.value ? 'archived' : 'active'} ${store.pagination.total === 1 ? 'client' : 'clients'}`)

function statusOf(error: unknown) { return (error as { status?: number; statusCode?: number } | undefined)?.status ?? (error as { statusCode?: number } | undefined)?.statusCode }
async function load() {
  try {
    await store.fetchClients({ q: search.value.trim() || undefined, client_type: type.value === 'all' ? undefined : type.value, lifecycle: lifecycle.value === 'all' ? undefined : lifecycle.value, archived: archived.value, page: page.value, per_page: 25 })
    accessState.value = 'ready'
  } catch (error) {
    const status = statusOf(error)
    accessState.value = status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : 'error'
  }
}
watch([search, type, lifecycle, archived], () => { page.value = 1; if (timer) clearTimeout(timer); timer = setTimeout(() => void load(), 300) })
watch(page, () => void load())
onMounted(() => void load())
onBeforeUnmount(() => { if (timer) clearTimeout(timer) })

function clearFilters() { search.value = ''; type.value = 'all'; lifecycle.value = 'all' }
async function submit(payload: ClientInput) {
  saving.value = true
  try { const client = await store.createClient(payload); showForm.value = false; await router.push(`/crm/clients/${client.id}`) }
  catch (error) { toast.error((error as { data?: { message?: string } })?.data?.message ?? 'Could not save the client. Your draft is still here.') }
  finally { saving.value = false }
}
function openClient(client: Client) { void router.push(`/crm/clients/${client.id}${client.archived_at ? '?archived=1' : ''}`) }
</script>

<template>
  <main class="mx-auto w-full max-w-6xl px-4 pt-8 pb-6 sm:px-6">
    <AppPageHeader title="Clients" :description="summary" :icon="UserRoundIcon">
      <template #breadcrumb><NuxtLink to="/crm" class="hover:text-foreground">CRM</NuxtLink><span aria-hidden="true"> / </span>Clients</template>
      <template #actions><Button class="min-h-11 gap-1.5 bg-brand-gradient border-0 text-primary-foreground" @click="showForm = true"><PlusIcon class="size-4" /> New client</Button></template>
    </AppPageHeader>

    <div class="surface flex flex-wrap items-center gap-2 p-2.5">
      <div class="relative min-w-[12rem] flex-1"><SearchIcon class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input v-model="search" aria-label="Search clients" placeholder="Search clients…" class="h-11 pl-9 sm:h-9" /></div>
      <Select v-model="type">
        <SelectTrigger class="h-11 min-w-32 sm:h-9" aria-label="Filter by client type">
          <SelectValue placeholder="All types" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="person">People</SelectItem>
            <SelectItem value="organization">Organizations</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select v-model="lifecycle">
        <SelectTrigger class="h-11 min-w-36 sm:h-9" aria-label="Filter by lifecycle">
          <SelectValue placeholder="All lifecycle" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">All lifecycle</SelectItem>
            <SelectItem value="prospect">Prospects</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="former">Former</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <Button variant="outline" class="h-11 gap-1.5 sm:h-9" :aria-pressed="archived" @click="archived = !archived"><ArchiveIcon class="size-4" /> {{ archived ? 'Archived' : 'Active' }}</Button>
    </div>
    <div v-if="isFiltered" class="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><span>Filters are active</span><Button variant="ghost" size="xs" @click="clearFilters">Clear all</Button></div>

    <div class="mt-5" aria-live="polite" :aria-busy="store.loading">
      <div v-if="store.loading" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Skeleton v-for="i in 6" :key="i" class="h-36 rounded-xl" /></div>
      <div v-else-if="accessState === 'unauthorized'" class="surface-inset py-16 text-center"><h2 class="text-lg font-semibold">Your session has ended</h2><p class="mt-2 text-sm text-muted-foreground">Sign in again to view your clients.</p><Button class="mt-5 min-h-11" @click="navigateTo('/login')">Sign in</Button></div>
      <div v-else-if="accessState === 'forbidden'" class="surface-inset py-16 text-center"><h2 class="text-lg font-semibold">Client access unavailable</h2><p class="mx-auto mt-2 max-w-md text-sm text-muted-foreground">You do not have permission to view this workspace.</p></div>
      <div v-else-if="accessState === 'error'" class="surface-inset py-16 text-center"><RefreshCwIcon class="mx-auto size-7 text-muted-foreground" /><h2 class="mt-3 text-lg font-semibold">Clients could not load</h2><p class="mt-2 text-sm text-muted-foreground">Check your connection and try again.</p><Button variant="outline" class="mt-5 min-h-11" @click="load">Retry</Button></div>
      <EmptyState v-else-if="!store.clients.length && isFiltered" :icon="SearchIcon" title="No clients match these filters" description="Try a broader search, or clear the filters to see every client." action-label="Clear filters" @action="clearFilters" />
      <EmptyState v-else-if="!store.clients.length" :icon="UserRoundIcon" :title="archived ? 'No archived clients' : 'No clients yet'" :description="archived ? 'Archived profiles remain preserved and can be restored when permitted.' : 'Create your first client profile to begin tracking intake.'" :action-label="archived ? undefined : 'New client'" :action-icon="PlusIcon" @action="showForm = true" />
      <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <article v-for="client in store.clients" :key="client.id" class="surface flex min-h-36 flex-col justify-between p-4 transition-shadow hover:shadow-raised">
          <button type="button" class="text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50" :aria-label="`Open ${client.display_name}`" @click="openClient(client)"><div class="flex items-start justify-between gap-3"><div><h2 class="font-semibold">{{ client.display_name }}</h2><p class="mt-1 text-xs text-muted-foreground">{{ client.client_type === 'person' ? 'Person' : 'Organization' }} · {{ client.lifecycle }}</p></div><span v-if="client.archived_at" class="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">Archived</span></div></button>
          <div class="mt-4 flex items-center justify-between text-xs text-muted-foreground"><span>{{ client.linked_cases_count ?? 0 }} linked {{ (client.linked_cases_count ?? 0) === 1 ? 'case' : 'cases' }}</span><span>{{ client.pipeline_items_count ?? 0 }} intake</span></div>
        </article>
      </div>
    </div>
    <nav v-if="store.pagination.last_page > 1" aria-label="Client pages" class="mt-5 flex items-center justify-between"><span class="text-sm text-muted-foreground">Page {{ store.pagination.current_page }} of {{ store.pagination.last_page }}</span><div class="flex gap-2"><Button variant="outline" size="icon" aria-label="Previous page" :disabled="page <= 1" @click="page--"><ChevronLeftIcon class="size-4" /></Button><Button variant="outline" size="icon" aria-label="Next page" :disabled="page >= store.pagination.last_page" @click="page++"><ChevronRightIcon class="size-4" /></Button></div></nav>
    <CrmClientForm v-if="showForm" :busy="saving" @submit="submit" @cancel="showForm = false" />
  </main>
</template>
