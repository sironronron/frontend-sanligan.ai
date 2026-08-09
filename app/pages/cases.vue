<script setup lang="ts">
import { FolderOpenIcon, Loader2Icon, PlusIcon, SearchIcon } from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import { useCaseStore, CASE_STATUSES, CASE_PRIORITIES, CASE_TYPES } from '~/stores/cases'
import { upgradeMessage } from '~/stores/billing'
import CaseIntakeForm, { type CaseIntakePayload, type IntakeTemplateOption } from '~/components/CaseIntakeForm.vue'

definePageMeta({
  middleware: ['auth', 'organization', 'subscription'],
})

const caseStore = useCaseStore()
const api = useApi()
const route = useRoute()
const router = useRouter()

const isDetail = computed(() => !!route.params.id)

const search = ref('')
const statusFilter = ref('all')
const typeFilter = ref('all')
const priorityFilter = ref('all')
const archived = ref(false)
const templates = ref<IntakeTemplateOption[]>([])
const showIntake = ref(false)
const creating = ref(false)

let searchTimer: ReturnType<typeof setTimeout> | null = null

const statusStyles: Record<string, string> = {
  open: 'bg-forest/10 text-forest dark:bg-cream/10 dark:text-peach',
  in_progress: 'bg-peach/60 text-espresso dark:bg-cream/10 dark:text-peach',
  on_hold: 'bg-espresso/10 text-espresso dark:bg-cream/10 dark:text-peach',
  closed: 'bg-muted text-muted-foreground',
}

const priorityStyles: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-espresso/10 text-espresso dark:bg-cream/10 dark:text-peach',
  high: 'bg-destructive/10 text-destructive dark:bg-cream/10 dark:text-destructive',
  urgent: 'bg-destructive/15 text-destructive dark:bg-cream/10 dark:text-destructive',
}

const typeLabels: Record<string, string> = {
  legal: 'Legal',
  hr: 'HR',
  customer_support: 'Customer Support',
  administrative: 'Administrative',
  general: 'General',
}

const statusLabel: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  closed: 'Closed',
}

function statusLabelFor(value: string) {
  return statusLabel[value] ?? value
}

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatDate(value: string | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function relativeTime(value: string | null) {
  if (!value) return ''
  const diff = Date.now() - new Date(value).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(value)
}

watch([search, statusFilter, typeFilter, priorityFilter, archived], () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    void loadCases()
  }, 300)
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

onMounted(async () => {
  await Promise.all([loadCases(), loadTemplates()])
})
</script>

<template>
  <div>
    <div v-if="!isDetail" class="mx-auto w-full max-w-6xl px-4 py-6">
      <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold">Cases</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Track your legal matters, deadlines, and correspondence in one place.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          class="gap-1.5"
          :class="{ 'text-primary': archived }"
          @click="archived = !archived"
        >
          <FolderOpenIcon class="size-4" />
          {{ archived ? 'Archived' : 'Active' }}
        </Button>
        <Button class="gap-1.5" @click="showIntake = true">
          <PlusIcon class="size-4" />
          New Case
        </Button>
      </div>
    </div>

    <div class="mb-5 flex flex-wrap items-center gap-2">
      <div class="relative min-w-52 flex-1">
        <SearchIcon class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input v-model="search" class="pl-9 text-sm" placeholder="Search title, reference, tags…" />
      </div>

      <Select v-model="statusFilter">
        <SelectTrigger class="w-40 text-sm">
          <SelectValue :placeholder="'Status'" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem v-for="s in CASE_STATUSES" :key="s.value" :value="s.value">{{ s.label }}</SelectItem>
        </SelectContent>
      </Select>

      <Select v-model="typeFilter">
        <SelectTrigger class="w-44 text-sm">
          <SelectValue :placeholder="'Case type'" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          <SelectItem v-for="t in CASE_TYPES" :key="t.value" :value="t.value">{{ t.label }}</SelectItem>
        </SelectContent>
      </Select>

      <Select v-model="priorityFilter">
        <SelectTrigger class="w-36 text-sm">
          <SelectValue :placeholder="'Priority'" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All priorities</SelectItem>
          <SelectItem v-for="p in CASE_PRIORITIES" :key="p.value" :value="p.value">{{ p.label }}</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div v-if="caseStore.loading" class="space-y-2">
      <Skeleton v-for="i in 5" :key="i" class="h-24 w-full rounded-xl" />
    </div>

    <div v-else-if="caseStore.cases.length === 0" class="rounded-xl border border-dashed py-16 text-center">
      <FolderOpenIcon class="mx-auto size-8 text-muted-foreground" />
      <p class="mt-3 text-sm font-medium">{{ archived ? 'No archived cases' : 'No cases yet' }}</p>
      <p class="mt-1 text-xs text-muted-foreground">
        {{ archived ? 'Restore a case from the archive to keep working on it.' : 'Create your first case to start tracking it.' }}
      </p>
      <Button v-if="!archived" class="mt-4 gap-1.5" @click="showIntake = true">
        <PlusIcon class="size-4" />
        New Case
      </Button>
    </div>

    <div v-else class="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <button
        v-for="c in caseStore.cases"
        :key="c.id"
        class="group flex flex-col gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
        @click="openCase(c.id)"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold group-hover:text-primary">{{ c.title }}</p>
            <p v-if="c.reference" class="mt-0.5 text-[11px] text-muted-foreground">{{ c.reference }}</p>
          </div>
          <div class="flex shrink-0 flex-wrap items-center gap-1.5">
            <Badge :class="statusStyles[c.status]" class="text-[10px]">
              {{ statusLabelFor(c.status) }}
            </Badge>
            <Badge v-if="c.priority" :class="priorityStyles[c.priority]" class="text-[10px]">
              {{ c.priority }}
            </Badge>
          </div>
        </div>

        <p v-if="c.description" class="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {{ c.description }}
        </p>

        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span>{{ typeLabels[c.case_type] ?? humanize(c.case_type) }}</span>
          <span v-if="c.due_date">Due {{ formatDate(c.due_date) }}</span>
          <span v-if="c.open_tasks_count > 0">{{ c.open_tasks_count }} open task{{ c.open_tasks_count === 1 ? '' : 's' }}</span>
          <span v-if="c.archived_at">Archived</span>
        </div>

        <div v-if="c.last_message_at" class="border-t pt-2 text-[11px] text-muted-foreground">
          <span class="line-clamp-1">
            <span class="mr-1 font-medium">Last message</span>
            {{ c.last_message_snippet || '' }}
          </span>
          <span class="mt-0.5 block">{{ relativeTime(c.last_message_at) }}</span>
        </div>
      </button>
    </div>

    <CaseIntakeForm
      v-if="showIntake"
      :templates="templates"
      :submit-label="creating ? 'Creating…' : 'Create Case'"
      @submit="handleIntakeSubmit"
      @cancel="handleIntakeCancel"
    />
    </div>

    <NuxtPage />
  </div>
</template>
