<script setup lang="ts">
import { categoryLabel, knowledgeTypeLabel, type KnowledgeType } from '~/lib/legalCategories'
import { rightsBasisLabel, standardStatusLabel, type StandardStatus } from '~/lib/standards'

definePageMeta({
  middleware: 'admin',
})

interface CrawledPage {
  id: string
  legal_source_id: string | null
  url: string
  kind: 'crawled' | 'uploaded'
  knowledge_type?: KnowledgeType
  category: string
  crawl_status: 'pending' | 'ok' | 'failed'
  http_status: number | null
  title: string | null
  law_name: string | null
  gr_number: string | null
  promulgation_date: string | null
  standard_code: string | null
  standard_edition: string | null
  standard_issuer: string | null
  standard_status: StandardStatus | null
  standard_publication_date: string | null
  standard_review_date: string | null
  rights_basis: string | null
  last_error: string | null
  last_crawled_at: string | null
  legal_source: { id: string; name: string } | null
}

interface Paginated<T> {
  data: T[]
  meta: {
    current_page: number
    last_page: number
    total: number
  }
}

const api = useApi()

const pages = ref<CrawledPage[]>([])
const meta = ref<Paginated<CrawledPage>['meta'] | null>(null)
const loading = ref(false)
const page = ref(1)
const statusFilter = ref('all')

const statusStyles: Record<string, { label: string; class: string }> = {
  pending: { label: 'Pending', class: 'bg-muted text-muted-foreground' },
  ok: { label: 'OK', class: 'bg-forest/10 text-forest dark:bg-cream/10 dark:text-peach' },
  failed: { label: 'Failed', class: 'bg-destructive/10 text-destructive' },
}

function badgeFor(status: string) {
  return statusStyles[status] ?? { label: status, class: 'bg-muted text-muted-foreground' }
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

async function loadPages() {
  loading.value = true
  try {
    const query: Record<string, string | number> = { page: page.value }
    if (statusFilter.value && statusFilter.value !== 'all') query.status = statusFilter.value

    const params = new URLSearchParams()
    Object.entries(query).forEach(([key, value]) => params.set(key, String(value)))
    const res = await api<Paginated<CrawledPage>>(`/admin/crawled-pages?${params}`)
    pages.value = res.data
    meta.value = res.meta
  } catch {
    pages.value = []
    meta.value = null
  } finally {
    loading.value = false
  }
}

function goTo(next: number) {
  if (!meta.value || next < 1 || next > meta.value.last_page) return
  page.value = next
  loadPages()
}

watch(statusFilter, () => {
  page.value = 1
  loadPages()
})

onMounted(loadPages)
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-4 py-6">
    <AdminNav />

    <AppPageHeader title="Indexed pages" description="Public official pages and standard summaries indexed in the shared knowledge base." />

    <div class="surface mb-6 flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
      <p class="text-sm text-muted-foreground">
        {{ meta?.total ?? 0 }} pages crawled
      </p>
      <div class="flex items-center gap-2">
        <Label for="crawled-status-filter" class="sr-only">Filter indexed pages by status</Label>
        <Select :model-value="statusFilter" @update:model-value="statusFilter = String($event)">
          <SelectTrigger id="crawled-status-filter" class="h-8 w-36">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="ok">OK</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead class="w-36">Source</TableHead>
            <TableHead>URL / title</TableHead>
            <TableHead class="w-24">Status</TableHead>
            <TableHead class="w-32">HTTP</TableHead>
            <TableHead class="w-44">Last crawled</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="p in pages" :key="p.id">
            <TableCell class="font-medium">{{ p.legal_source?.name ?? '—' }}</TableCell>
            <TableCell>
              <a
                :href="p.url"
                target="_blank"
                rel="noopener noreferrer"
                class="block max-w-md truncate text-primary hover:underline"
              >
                {{ p.title || p.url }}
              </a>
              <p class="mt-0.5 max-w-md truncate text-xs text-muted-foreground">{{ p.url }}</p>
              <p v-if="p.knowledge_type !== 'standard' && (p.law_name || p.gr_number)" class="mt-0.5 text-xs text-muted-foreground">
                {{ [p.law_name, p.gr_number].filter(Boolean).join(' · ') }}
              </p>
              <template v-if="p.knowledge_type === 'standard'">
                <p class="mt-0.5 text-xs text-muted-foreground">
                  {{ knowledgeTypeLabel(p.knowledge_type) }} · {{ [p.standard_code, p.standard_edition && `ed. ${p.standard_edition}`, p.standard_issuer, standardStatusLabel(p.standard_status)].filter(Boolean).join(' · ') }}
                </p>
                <p class="mt-0.5 text-xs text-muted-foreground">Rights: {{ rightsBasisLabel(p.rights_basis) }}</p>
              </template>
              <p class="mt-0.5 text-xs text-muted-foreground">
                {{ p.knowledge_type === 'standard' ? categoryLabel(p.category) : `${knowledgeTypeLabel(p.knowledge_type)} · ${categoryLabel(p.category)}` }}
                <span v-if="p.kind === 'uploaded'"> · uploaded</span>
              </p>
              <p v-if="p.crawl_status === 'failed' && p.last_error" class="mt-0.5 text-xs text-destructive">
                {{ p.last_error }}
              </p>
            </TableCell>
            <TableCell>
              <span class="rounded-full px-2 py-0.5 text-[10px] font-medium" :class="badgeFor(p.crawl_status).class">
                {{ badgeFor(p.crawl_status).label }}
              </span>
            </TableCell>
            <TableCell class="text-muted-foreground">{{ p.http_status ?? '—' }}</TableCell>
            <TableCell class="text-xs text-muted-foreground">{{ formatDate(p.last_crawled_at) }}</TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <div v-if="loading" class="space-y-2 p-4" role="status" aria-label="Loading">
        <Skeleton v-for="row in 5" :key="row" class="h-8 w-full" />
      </div>
      <EmptyState
        v-else-if="pages.length === 0"
        title="No indexed pages match"
        description="Adjust the filters, or run a crawl from the Knowledge sources tab."
        class="m-4 border-0"
      />

      <div v-if="meta && meta.last_page > 1" class="flex items-center justify-between border-t px-4 py-3">
        <p class="text-xs text-muted-foreground">
          Page {{ meta.current_page }} of {{ meta.last_page }}
        </p>
        <div class="flex gap-1">
          <Button variant="outline" size="sm" :disabled="meta.current_page <= 1" @click="goTo(meta.current_page - 1)">
            Previous
          </Button>
          <Button variant="outline" size="sm" :disabled="meta.current_page >= meta.last_page" @click="goTo(meta.current_page + 1)">
            Next
          </Button>
        </div>
      </div>
    </Card>
  </div>
</template>
