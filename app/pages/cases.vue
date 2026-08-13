<script setup lang="ts">
import { ArchiveIcon, FolderOpenIcon, PlusIcon, SearchIcon, SlidersHorizontalIcon, XIcon } from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import { useCaseStore, CASE_STATUSES, CASE_PRIORITIES, CASE_TYPES, type LegalCase } from '~/stores/cases'
import { upgradeMessage } from '~/stores/billing'
import CaseIntakeForm, { type CaseIntakePayload, type IntakeTemplateOption } from '~/components/CaseIntakeForm.vue'

definePageMeta({
  middleware: ['auth', 'organization', 'subscription'],
})

const caseStore = useCaseStore()
const api = useApi()
const route = useRoute()
const router = useRouter()

const { typeLabel, priorityLabel, dueState } = useCasePresentation()

const isDetail = computed(() => !!route.params.id)

const search = ref('')
const statusFilter = ref('all')
const typeFilter = ref('all')
const priorityFilter = ref('all')
const archived = ref(false)
const templates = ref<IntakeTemplateOption[]>([])
const showIntake = ref(false)
const creating = ref(false)

/**
 * Sorting is client-side: the list is already fully in memory after the
 * filtered fetch, and a round trip to reorder rows the user is looking at
 * would be a visible stall for no gain.
 */
type SortKey = 'activity' | 'due' | 'priority' | 'created' | 'title'

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'activity', label: 'Recent activity' },
  { value: 'due', label: 'Due date' },
  { value: 'priority', label: 'Priority' },
  { value: 'created', label: 'Newest first' },
  { value: 'title', label: 'Title (A–Z)' },
]

const sort = ref<SortKey>('activity')

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

let searchTimer: ReturnType<typeof setTimeout> | null = null

watch([search, statusFilter, typeFilter, priorityFilter, archived], () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    void loadCases()
  }, 300)
})

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
})

async function loadCases() {
  await caseStore.fetchCases({
    search: search.value.trim() || undefined,
    status: statusFilter.value === 'all' ? undefined : statusFilter.value,
    case_type: typeFilter.value === 'all' ? undefined : typeFilter.value,
    priority: priorityFilter.value === 'all' ? undefined : priorityFilter.value,
    archived: archived.value,
  })
}

function timeOf(value: string | null) {
  const t = value ? new Date(value).getTime() : Number.NaN
  return Number.isNaN(t) ? null : t
}

const sortedCases = computed<LegalCase[]>(() => {
  const list = [...caseStore.cases]

  switch (sort.value) {
    case 'due':
      // Cases with no deadline sink to the bottom rather than sorting as epoch 0.
      return list.sort((a, b) => {
        const at = timeOf(a.due_date)
        const bt = timeOf(b.due_date)
        if (at === null && bt === null) return 0
        if (at === null) return 1
        if (bt === null) return -1
        return at - bt
      })
    case 'priority':
      return list.sort(
        (a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9),
      )
    case 'created':
      return list.sort((a, b) => (timeOf(b.created_at) ?? 0) - (timeOf(a.created_at) ?? 0))
    case 'title':
      return list.sort((a, b) => a.title.localeCompare(b.title))
    default:
      return list.sort(
        (a, b) =>
          (timeOf(b.last_message_at) ?? timeOf(b.updated_at) ?? 0) -
          (timeOf(a.last_message_at) ?? timeOf(a.updated_at) ?? 0),
      )
  }
})

/** Cases whose deadline has passed and that nobody has closed out. */
const overdueCount = computed(
  () =>
    caseStore.cases.filter(
      (c) => !c.archived_at && c.status !== 'closed' && dueState(c.due_date)?.tone === 'overdue',
    ).length,
)

/** A live read of the list standing in for the old static blurb. */
const summary = computed(() => {
  const n = caseStore.cases.length
  const noun = n === 1 ? 'case' : 'cases'
  const scope = archived.value ? 'archived' : 'active'
  const head = `${n} ${scope} ${noun}`
  return overdueCount.value > 0 ? `${head} · ${overdueCount.value} past due` : head
})

/**
 * Which narrowing controls are on, as removable chips. Four always-open
 * selects gave no answer to "why am I seeing so few rows?" — the chips do,
 * and they make undoing one filter a single click.
 */
const activeFilters = computed(() => {
  const chips: Array<{ key: string; label: string; clear: () => void }> = []
  if (search.value.trim()) {
    chips.push({ key: 'search', label: `“${search.value.trim()}”`, clear: () => (search.value = '') })
  }
  if (typeFilter.value !== 'all') {
    chips.push({
      key: 'type',
      label: `Type: ${typeLabel(typeFilter.value)}`,
      clear: () => (typeFilter.value = 'all'),
    })
  }
  if (priorityFilter.value !== 'all') {
    chips.push({
      key: 'priority',
      label: `Priority: ${priorityLabel(priorityFilter.value)}`,
      clear: () => (priorityFilter.value = 'all'),
    })
  }
  return chips
})

const isFiltered = computed(() => activeFilters.value.length > 0 || statusFilter.value !== 'all')

function clearFilters() {
  search.value = ''
  statusFilter.value = 'all'
  typeFilter.value = 'all'
  priorityFilter.value = 'all'
}

async function loadTemplates() {
  try {
    const { data } = await api<{ data: Array<{ id: string; name: string; category: string }> }>('/templates')
    templates.value = data
  } catch {
    templates.value = []
  }
}

async function handleIntakeSubmit(payload: CaseIntakePayload) {
  creating.value = true
  try {
    const created = await caseStore.createCase(payload)
    showIntake.value = false
    toast.success('Case created')
    await router.push({ path: `/cases/${created.id}` })
  } catch (err: any) {
    const upgrade = upgradeMessage(err)
    if (upgrade) {
      toast.error(`${upgrade}. Upgrade your plan to continue.`, {
        action: { label: 'Upgrade', onClick: () => navigateTo('/settings/billing') },
      })
    } else {
      toast.error(err?.data?.message ?? 'Could not create the case')
    }
  } finally {
    creating.value = false
  }
}

function handleIntakeCancel() {
  showIntake.value = false
}

async function openCase(id: string) {
  await router.push({ path: `/cases/${id}` })
}

async function openProgress(id: string) {
  await router.push({ path: `/cases/${id}`, query: { view: 'progress' } })
}

onMounted(async () => {
  await Promise.all([loadCases(), loadTemplates()])
})
</script>

<template>
  <div>
    <div v-if="!isDetail" class="mx-auto w-full max-w-5xl px-4 py-6">
      <PageHeader title="Cases" :description="summary">
        <template #actions>
          <Button
            variant="outline"
            class="gap-1.5"
            :class="archived ? 'text-primary' : ''"
            :aria-pressed="archived"
            @click="archived = !archived"
          >
            <component :is="archived ? ArchiveIcon : FolderOpenIcon" class="size-4" />
            {{ archived ? 'Archived' : 'Active' }}
          </Button>
          <Button data-tour="cases-new" class="gap-1.5" @click="showIntake = true">
            <PlusIcon class="size-4" />
            New Case
          </Button>
        </template>
      </PageHeader>

      <!--
        Status is the filter people reach for constantly, so it gets a
        permanent segmented control instead of hiding inside a select next to
        two it is used far less often than.
      -->
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex items-center overflow-x-auto rounded-lg border bg-muted/40 p-0.5" role="tablist" aria-label="Filter by status">
          <button
            v-for="option in [{ value: 'all', label: 'All' }, ...CASE_STATUSES]"
            :key="option.value"
            type="button"
            role="tab"
            :aria-selected="statusFilter === option.value"
            class="inline-flex h-7 shrink-0 items-center rounded-md px-3 text-xs font-medium transition-colors"
            :class="statusFilter === option.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            @click="statusFilter = option.value"
          >
            {{ option.label }}
          </button>
        </div>

        <div class="relative min-w-48 flex-1">
          <SearchIcon class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="search" class="h-8 pl-9 text-sm" placeholder="Search title, reference, tags…" />
        </div>

        <Select v-model="typeFilter">
          <SelectTrigger class="w-36">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem v-for="t in CASE_TYPES" :key="t.value" :value="t.value">{{ t.label }}</SelectItem>
          </SelectContent>
        </Select>

        <Select v-model="priorityFilter">
          <SelectTrigger class="w-32">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem v-for="p in CASE_PRIORITIES" :key="p.value" :value="p.value">{{ p.label }}</SelectItem>
          </SelectContent>
        </Select>

        <!--
          Wrapped so the trigger's justify-between sees one child plus its
          chevron; a bare leading icon would get spread to the far edge.
        -->
        <Select v-model="sort">
          <SelectTrigger class="w-44" aria-label="Sort cases">
            <span class="flex min-w-0 items-center gap-1.5">
              <SlidersHorizontalIcon class="size-3.5 shrink-0 text-muted-foreground" />
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="option in SORT_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div v-if="activeFilters.length > 0" class="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          v-for="chip in activeFilters"
          :key="chip.key"
          type="button"
          class="inline-flex h-6 items-center gap-1 rounded-4xl border bg-card px-2 text-xs text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
          @click="chip.clear()"
        >
          {{ chip.label }}
          <XIcon class="size-3" />
        </button>
        <Button variant="ghost" size="xs" class="text-muted-foreground" @click="clearFilters">Clear all</Button>
      </div>

      <div class="mt-4">
        <div v-if="caseStore.loading" class="space-y-2">
          <Skeleton v-for="i in 6" :key="i" class="h-[4.75rem] w-full rounded-xl" />
        </div>

        <!--
          A filtered-to-nothing list and a genuinely empty workspace need
          different offers: one wants its filters back, the other wants a case.
        -->
        <div v-else-if="sortedCases.length === 0 && isFiltered" class="rounded-xl border border-dashed py-14 text-center">
          <SearchIcon class="mx-auto size-7 text-muted-foreground" />
          <p class="mt-3 text-sm font-medium">No cases match these filters</p>
          <p class="mt-1 text-xs text-muted-foreground">Try a broader search, or clear the filters to see everything.</p>
          <Button variant="outline" size="sm" class="mt-4" @click="clearFilters">Clear filters</Button>
        </div>

        <div v-else-if="sortedCases.length === 0" class="rounded-xl border border-dashed py-14 text-center">
          <FolderOpenIcon class="mx-auto size-7 text-muted-foreground" />
          <p class="mt-3 text-sm font-medium">{{ archived ? 'No archived cases' : 'No cases yet' }}</p>
          <p class="mt-1 text-xs text-muted-foreground">
            {{ archived ? 'Restore a case from the archive to keep working on it.' : 'Create your first case to start tracking it.' }}
          </p>
          <Button v-if="!archived" class="mt-4 gap-1.5" @click="showIntake = true">
            <PlusIcon class="size-4" />
            New Case
          </Button>
        </div>

        <div v-else class="space-y-2">
          <CaseListItem
            v-for="c in sortedCases"
            :key="c.id"
            :case="c"
            @open="openCase"
            @progress="openProgress"
          />
        </div>
      </div>

      <CaseIntakeForm
        v-if="showIntake"
        :templates="templates"
        :busy="creating"
        :submit-label="creating ? 'Creating…' : 'Create Case'"
        @submit="handleIntakeSubmit"
        @cancel="handleIntakeCancel"
      />
    </div>

    <NuxtPage :transition="{ name: 'page', mode: 'out-in' }" />
  </div>
</template>
