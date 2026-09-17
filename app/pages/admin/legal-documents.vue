<script setup lang="ts">
import { toast } from '~/components/ui/sonner'
import { FileUpIcon, TrashIcon, Loader2Icon, EyeIcon, DownloadIcon } from '@lucide/vue'
import { LEGAL_CATEGORIES, KNOWLEDGE_TYPES, categoryLabel, knowledgeTypeLabel, type KnowledgeType } from '~/lib/legalCategories'
import { authHeaders } from '~/lib/http'
import {
  ISO_STANDARDS,
  STANDARD_RIGHTS_BASES,
  STANDARD_STATUSES,
  rightsBasisLabel,
  standardStatusLabel,
  type StandardStatus,
} from '~/lib/standards'

definePageMeta({
  middleware: 'admin',
})

interface LegalDocument {
  id: string
  title: string
  original_filename: string
  mime_type: string | null
  category: string
  knowledge_type?: KnowledgeType
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
  crawl_status: 'pending' | 'ok' | 'failed'
  last_error: string | null
  storage_path: string | null
  chunks_count: number
  created_at: string
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
const { fileIcon } = useFileTypeIcon()
const {
  public: { apiBase },
} = useRuntimeConfig()

const documents = ref<LegalDocument[]>([])
const meta = ref<Paginated<LegalDocument>['meta'] | null>(null)
const loading = ref(false)
const page = ref(1)
const statusFilter = ref('all')

const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const uploading = ref(false)
const uploadError = ref('')
const form = reactive({
  title: '',
  knowledge_type: 'legal' as KnowledgeType,
  law_name: '',
  gr_number: '',
  promulgation_date: '',
  category: 'law',
  standard_code: '',
  standard_edition: '',
  standard_issuer: '',
  standard_status: 'current' as StandardStatus,
  standard_publication_date: '',
  standard_review_date: '',
  rights_basis: '',
})

const selectedStandard = computed(() => ISO_STANDARDS.find((standard) => standard.code === form.standard_code))

watch(
  () => form.knowledge_type,
  (knowledgeType) => {
    form.category = knowledgeType === 'standard' ? 'standard' : 'law'

    if (knowledgeType === 'legal') {
      Object.assign(form, {
        standard_code: '',
        standard_edition: '',
        standard_issuer: '',
        standard_status: 'current' as StandardStatus,
        standard_publication_date: '',
        standard_review_date: '',
        rights_basis: '',
      })
    }
  },
)

const polling = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null

const statusStyles: Record<LegalDocument['crawl_status'], string> = {
  pending: 'bg-muted text-muted-foreground',
  ok: 'bg-forest/10 text-forest dark:bg-cream/10 dark:text-peach',
  failed: 'bg-destructive/10 text-destructive',
}

const statusLabel: Record<LegalDocument['crawl_status'], string> = {
  pending: 'Pending',
  ok: 'Indexed',
  failed: 'Failed',
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

function hasPending() {
  return documents.value.some((d) => d.crawl_status === 'pending')
}

function schedulePolling() {
  const pending = hasPending()
  if (pending && pollTimer === null) {
    pollTimer = setInterval(loadDocuments, 3000)
  } else if (!pending && pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function loadDocuments() {
  loading.value = true
  try {
    const query: Record<string, string | number> = { page: page.value }
    if (statusFilter.value && statusFilter.value !== 'all') query.status = statusFilter.value

    const params = new URLSearchParams()
    Object.entries(query).forEach(([key, value]) => params.set(key, String(value)))
    const res = await api<Paginated<LegalDocument>>(`/admin/legal-documents?${params}`)
    documents.value = res.data
    meta.value = res.meta
  } catch {
    // keep the current list on transient errors
  } finally {
    loading.value = false
    schedulePolling()
  }
}

function goTo(next: number) {
  if (!meta.value || next < 1 || next > meta.value.last_page) return
  page.value = next
  loadDocuments()
}

function onFileSelected(event: Event) {
  const target = event.target as HTMLInputElement
  selectedFile.value = target.files?.[0] ?? null
  target.value = ''
  uploadError.value = ''
}

function removeSelected() {
  selectedFile.value = null
}

function selectStandard(code: string) {
  form.standard_code = code
  const standard = ISO_STANDARDS.find((entry) => entry.code === code)
  form.standard_issuer = standard?.issuers.join(', ') ?? ''
}

function validateStandardForm() {
  if (form.knowledge_type !== 'standard') return true

  if (!form.standard_code || !form.standard_edition.trim() || !form.standard_issuer.trim() || !form.standard_status || !form.rights_basis) {
    uploadError.value = 'Standard code, edition, issuer, status, and rights basis are required.'
    return false
  }

  return true
}

async function upload() {
  if (!selectedFile.value || uploading.value) return
  uploading.value = true
  uploadError.value = ''

  if (!validateStandardForm()) {
    uploading.value = false
    return
  }

  const file = selectedFile.value
  const formData = new FormData()
  formData.append('file', file)
  formData.append('knowledge_type', form.knowledge_type)
  formData.append('category', form.category)
  if (form.title.trim()) formData.append('title', form.title.trim())
  if (form.knowledge_type === 'legal') {
    if (form.law_name.trim()) formData.append('law_name', form.law_name.trim())
    if (form.gr_number.trim()) formData.append('gr_number', form.gr_number.trim())
    if (form.promulgation_date) formData.append('promulgation_date', form.promulgation_date)
  } else {
    if (form.standard_code) formData.append('standard_code', form.standard_code)
    if (form.standard_edition.trim()) formData.append('standard_edition', form.standard_edition.trim())
    if (form.standard_issuer.trim()) formData.append('standard_issuer', form.standard_issuer.trim())
    if (form.standard_status) formData.append('standard_status', form.standard_status)
    if (form.standard_publication_date) formData.append('standard_publication_date', form.standard_publication_date)
    if (form.standard_review_date) formData.append('standard_review_date', form.standard_review_date)
    if (form.rights_basis) formData.append('rights_basis', form.rights_basis)
  }

  try {
    await api('/admin/legal-documents', {
      method: 'POST',
      body: formData,
    })
    toast.success(`"${file.name}" queued for indexing`)
    selectedFile.value = null
    Object.assign(form, {
      title: '',
      knowledge_type: 'legal' as KnowledgeType,
      law_name: '',
      gr_number: '',
      promulgation_date: '',
      category: 'law',
      standard_code: '',
      standard_edition: '',
      standard_issuer: '',
      standard_status: 'current' as StandardStatus,
      standard_publication_date: '',
      standard_review_date: '',
      rights_basis: '',
    })
  } catch (err: any) {
    uploadError.value = err?.data?.message ?? 'Could not upload the legal document.'
  } finally {
    uploading.value = false
    await loadDocuments()
  }
}

async function openFile(doc: LegalDocument) {
  try {
    const response = await fetch(`${apiBase}/api/admin/legal-documents/${doc.id}/file`, {
      headers: await authHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Could not load the file (HTTP ${response.status})`)
    }

    const url = URL.createObjectURL(await response.blob())
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch {
    toast.error('Could not open the file')
  }
}

async function download(doc: LegalDocument) {
  try {
    const response = await fetch(`${apiBase}/api/admin/legal-documents/${doc.id}/file`, {
      headers: await authHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Could not load the file (HTTP ${response.status})`)
    }

    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = doc.original_filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    toast.error('Could not download the file')
  }
}

async function removeDocument(doc: LegalDocument) {
  try {
    await api(`/admin/legal-documents/${doc.id}`, { method: 'DELETE' })
    toast.success(`Deleted ${doc.original_filename}`)
    await loadDocuments()
  } catch {
    toast.error('Could not delete the legal document')
  }
}

watch(statusFilter, () => {
  page.value = 1
  loadDocuments()
})

onMounted(loadDocuments)

onBeforeUnmount(() => {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-4 pt-8 pb-6">
    <AdminNav />

    <AppPageHeader title="Knowledge documents" description="Legal authorities and rights-cleared standard references in the shared knowledge base." />

    <Card class="mb-6">
      <CardHeader>
        <CardTitle class="text-base">Upload a knowledge document</CardTitle>
        <CardDescription>
          Upload legal authorities or a licensed standard copy/public summary. The AI retrieves and cites indexed documents in chat.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" @submit.prevent="upload">
          <div
            class="surface-inset border-dashed p-5 transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
            :class="selectedFile ? '' : 'cursor-pointer hover:border-primary/50'"
          >
            <label v-if="!selectedFile" for="document-file" class="block cursor-pointer rounded-md">
              <div class="flex flex-col items-center gap-2 text-center">
                <div class="flex size-10 items-center justify-center rounded-full bg-card shadow-sm">
                  <FileUpIcon class="size-4 text-muted-foreground" />
                </div>
                <p class="text-sm font-medium">PDF, DOCX, TXT, or MD</p>
                <p class="text-xs text-muted-foreground">
                  Click to choose a file
                </p>
              </div>
            </label>
            <div v-else class="flex items-center gap-3 text-sm" @click.stop>
              <component :is="fileIcon(selectedFile.name, selectedFile.type)" class="size-4 shrink-0 text-muted-foreground" />
              <span class="min-w-0 flex-1 truncate font-medium">{{ selectedFile.name }}</span>
              <span class="shrink-0 text-xs text-muted-foreground">{{ (selectedFile.size / 1024).toFixed(0) }} KB</span>
              <Button type="button" variant="ghost" size="sm" @click="removeSelected">
                Remove
              </Button>
            </div>
            <input
              id="document-file"
              ref="fileInput"
              name="file"
              type="file"
              accept=".pdf,.docx,.txt,.md"
              class="sr-only"
              aria-label="Choose a knowledge document"
              @change="onFileSelected"
            />
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-2">
              <Label for="doc-title">Title</Label>
              <Input id="doc-title" v-model="form.title" placeholder="People v. Juan, G.R. No. 143491" />
            </div>
            <div class="space-y-2">
              <Label for="doc-knowledge-type">Knowledge type</Label>
              <Select v-model="form.knowledge_type">
                <SelectTrigger id="doc-knowledge-type" class="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="type in KNOWLEDGE_TYPES" :key="type.value" :value="type.value">
                    {{ type.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div v-if="form.knowledge_type === 'legal'" class="space-y-2">
              <Label for="doc-category" class="flex items-center gap-1">
                Category <span class="text-destructive">*</span>
              </Label>
              <Select v-model="form.category">
                <SelectTrigger id="doc-category" class="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="c in LEGAL_CATEGORIES.filter((category) => category.value !== 'standard')" :key="c.value" :value="c.value">
                    {{ c.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div v-else class="space-y-2">
              <Label>Category</Label>
              <div role="status" aria-label="Category" class="surface-inset flex min-h-10 items-center px-3 text-sm text-muted-foreground">
                {{ categoryLabel(form.category) }}
              </div>
            </div>
          </div>

          <div v-if="form.knowledge_type === 'legal'" class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-2">
              <Label for="doc-law-name">Law name</Label>
              <Input id="doc-law-name" v-model="form.law_name" placeholder="Republic Act No. 6657" />
            </div>
            <div class="space-y-2">
              <Label for="doc-gr-number">G.R. number</Label>
              <Input id="doc-gr-number" v-model="form.gr_number" placeholder="G.R. No. 143491" />
            </div>
            <div class="space-y-2">
              <Label for="doc-promulgation">Promulgation date</Label>
              <Input id="doc-promulgation" v-model="form.promulgation_date" type="date" />
            </div>
          </div>

          <div v-else class="space-y-4 rounded-lg border border-border/60 p-4">
            <div class="space-y-2">
              <Label for="doc-standard-code">ISO standard</Label>
              <Select
                :model-value="form.standard_code"
                @update:model-value="selectStandard(String($event))"
              >
                <SelectTrigger id="doc-standard-code" class="w-full">
                  <SelectValue placeholder="Choose a standard profile" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="standard in ISO_STANDARDS" :key="standard.code" :value="standard.code">
                    {{ standard.code }} — {{ standard.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <a
                v-if="selectedStandard"
                :href="selectedStandard.reference_url"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-block text-xs text-primary hover:underline"
              >
                View ISO catalog reference
              </a>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div class="space-y-2">
                <Label for="doc-standard-edition">Edition</Label>
                <Input id="doc-standard-edition" v-model="form.standard_edition" name="standard_edition" autocomplete="off" placeholder="2019" />
              </div>
              <div class="space-y-2">
                <Label for="doc-standard-issuer">Issuer</Label>
                <Input id="doc-standard-issuer" v-model="form.standard_issuer" name="standard_issuer" autocomplete="organization" placeholder="ISO" />
              </div>
              <div class="space-y-2">
                <Label for="doc-standard-status">Status</Label>
                <Select v-model="form.standard_status">
                  <SelectTrigger id="doc-standard-status" class="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="status in STANDARD_STATUSES" :key="status.value" :value="status.value">
                      {{ status.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div class="space-y-2">
                <Label for="doc-rights-basis">Rights basis</Label>
                <Select v-model="form.rights_basis">
                  <SelectTrigger id="doc-rights-basis" class="w-full">
                    <SelectValue placeholder="Choose a rights basis" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="basis in STANDARD_RIGHTS_BASES" :key="basis.value" :value="basis.value">
                      {{ basis.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div class="space-y-2">
                <Label for="doc-standard-publication">Publication date</Label>
                <Input id="doc-standard-publication" v-model="form.standard_publication_date" name="standard_publication_date" autocomplete="off" type="date" />
              </div>
              <div class="space-y-2">
                <Label for="doc-standard-review">Review date</Label>
                <Input id="doc-standard-review" v-model="form.standard_review_date" name="standard_review_date" autocomplete="off" type="date" />
              </div>
            </div>

            <p class="text-xs leading-relaxed text-muted-foreground">
              Rights basis is required. Upload the full standard only when you have a licensed copy; otherwise upload a public summary or excerpt. Do not add copyrighted ISO text without permission.
            </p>
          </div>

          <p v-if="uploadError" role="alert" aria-live="assertive" class="text-sm text-destructive">{{ uploadError }}</p>

          <div class="flex justify-end">
            <Button type="submit" :disabled="!selectedFile" :loading="uploading">
              {{ uploading ? 'Uploading…' : 'Upload' }}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>

    <div class="mb-4 flex items-center justify-between">
      <p class="text-sm text-muted-foreground">
        {{ meta?.total ?? 0 }} uploaded document{{ (meta?.total ?? 0) === 1 ? '' : 's' }}
      </p>
      <Label for="document-status-filter" class="sr-only">Filter documents by status</Label>
      <Select :model-value="statusFilter" @update:model-value="statusFilter = String($event)">
        <SelectTrigger id="document-status-filter" class="h-8 w-36">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="ok">Indexed</SelectItem>
          <SelectItem value="failed">Failed</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead class="w-28">Category</TableHead>
            <TableHead class="w-24">Status</TableHead>
            <TableHead class="w-20">Chunks</TableHead>
            <TableHead class="w-44">Uploaded</TableHead>
            <TableHead class="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="doc in documents" :key="doc.id">
            <TableCell>
              <p class="font-medium">{{ doc.title || doc.original_filename }}</p>
              <p class="mt-0.5 max-w-md truncate text-xs text-muted-foreground">{{ doc.original_filename }}</p>
              <p v-if="doc.knowledge_type !== 'standard' && (doc.law_name || doc.gr_number)" class="mt-0.5 text-xs text-muted-foreground">
                {{ [doc.law_name, doc.gr_number].filter(Boolean).join(' · ') }}
              </p>
              <template v-if="doc.knowledge_type === 'standard'">
                <p class="mt-0.5 text-xs text-muted-foreground">
                  {{ [doc.standard_code, doc.standard_edition && `ed. ${doc.standard_edition}`, doc.standard_issuer, standardStatusLabel(doc.standard_status)].filter(Boolean).join(' · ') }}
                </p>
                <p class="mt-0.5 text-xs text-muted-foreground">Rights: {{ rightsBasisLabel(doc.rights_basis) }}</p>
              </template>
              <p v-if="doc.crawl_status === 'failed' && doc.last_error" class="mt-0.5 text-xs text-destructive">
                {{ doc.last_error }}
              </p>
            </TableCell>
            <TableCell>
              <span class="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {{ knowledgeTypeLabel(doc.knowledge_type) }}
              </span>
              <span class="mt-1 block rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {{ categoryLabel(doc.category) }}
              </span>
            </TableCell>
            <TableCell>
              <span class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium" :class="statusStyles[doc.crawl_status]">
                <Loader2Icon v-if="doc.crawl_status === 'pending'" class="size-3 animate-spin" />
                {{ statusLabel[doc.crawl_status] }}
              </span>
            </TableCell>
            <TableCell class="text-muted-foreground">{{ doc.chunks_count }}</TableCell>
            <TableCell class="text-xs text-muted-foreground">
              {{ (doc.knowledge_type === 'standard' ? doc.standard_publication_date : doc.promulgation_date) || formatDate(doc.created_at) }}
            </TableCell>
            <TableCell>
              <div class="flex items-center justify-end gap-1">
                <Button variant="ghost" size="icon" class="text-muted-foreground hover:text-foreground" @click="openFile(doc)">
                  <EyeIcon class="size-4" />
                  <span class="sr-only">Open {{ doc.original_filename }}</span>
                </Button>
                <Button variant="ghost" size="icon" class="text-muted-foreground hover:text-foreground" @click="download(doc)">
                  <DownloadIcon class="size-4" />
                  <span class="sr-only">Download {{ doc.original_filename }}</span>
                </Button>
                <Button variant="ghost" size="icon" class="text-muted-foreground hover:text-destructive" @click="removeDocument(doc)">
                  <TrashIcon class="size-4" />
                  <span class="sr-only">Delete {{ doc.original_filename }}</span>
                </Button>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <div v-if="loading" class="space-y-2 p-4" role="status" aria-label="Loading">
        <Skeleton v-for="row in 3" :key="row" class="h-8 w-full" />
      </div>
      <EmptyState
        v-else-if="documents.length === 0"
        title="No uploaded documents"
        description="Upload a file above to add an authority to the shared knowledge base."
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
