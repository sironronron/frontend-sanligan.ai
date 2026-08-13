<script setup lang="ts">
import { toast } from '~/components/ui/sonner'
import { FileUpIcon, TrashIcon, Loader2Icon, EyeIcon, DownloadIcon } from '@lucide/vue'
import { LEGAL_CATEGORIES, categoryLabel } from '~/lib/legalCategories'
import { authHeaders } from '~/lib/http'

definePageMeta({
  middleware: 'admin',
})

interface LegalDocument {
  id: string
  title: string
  original_filename: string
  mime_type: string | null
  category: string
  law_name: string | null
  gr_number: string | null
  promulgation_date: string | null
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
const statusFilter = ref('')

const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const uploading = ref(false)
const uploadError = ref('')
const form = reactive({
  title: '',
  law_name: '',
  gr_number: '',
  promulgation_date: '',
  category: 'law',
})

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
    if (statusFilter.value) query.status = statusFilter.value

    const res = await api<Paginated<LegalDocument>>(`/admin/legal-documents?${new URLSearchParams(String(query))}`)
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

function pickFile() {
  fileInput.value?.click()
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

async function upload() {
  if (!selectedFile.value || uploading.value) return
  uploading.value = true
  uploadError.value = ''

  const file = selectedFile.value
  const formData = new FormData()
  formData.append('file', file)
  formData.append('category', form.category)
  if (form.title.trim()) formData.append('title', form.title.trim())
  if (form.law_name.trim()) formData.append('law_name', form.law_name.trim())
  if (form.gr_number.trim()) formData.append('gr_number', form.gr_number.trim())
  if (form.promulgation_date) formData.append('promulgation_date', form.promulgation_date)

  try {
    await api('/admin/legal-documents', {
      method: 'POST',
      body: formData,
    })
    toast.success(`"${file.name}" queued for indexing`)
    selectedFile.value = null
    Object.assign(form, { title: '', law_name: '', gr_number: '', promulgation_date: '', category: 'law' })
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
  <div class="mx-auto w-full max-w-6xl px-4 py-8">
    <AdminNav />

    <Card class="mb-6">
      <CardHeader>
        <CardTitle class="text-base">Upload a legal document</CardTitle>
        <CardDescription>
          The document enters the shared knowledge base: the AI retrieves and cites it in chat, exactly like the sources the crawler indexes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" @submit.prevent="upload">
          <div
            class="rounded-xl border border-dashed bg-muted/30 p-5 transition-colors"
            :class="selectedFile ? '' : 'cursor-pointer hover:border-primary/50'"
            @click="!selectedFile && pickFile()"
          >
            <div v-if="!selectedFile" class="flex flex-col items-center gap-2 text-center">
              <div class="flex size-10 items-center justify-center rounded-full bg-background shadow-sm">
                <FileUpIcon class="size-4 text-muted-foreground" />
              </div>
              <p class="text-sm font-medium">PDF, DOCX, TXT, or MD</p>
              <p class="text-xs text-muted-foreground">
                Click to choose a file
              </p>
            </div>
            <div v-else class="flex items-center gap-3 text-sm" @click.stop>
              <component :is="fileIcon(selectedFile.name, selectedFile.type)" class="size-4 shrink-0 text-muted-foreground" />
              <span class="min-w-0 flex-1 truncate font-medium">{{ selectedFile.name }}</span>
              <span class="shrink-0 text-xs text-muted-foreground">{{ (selectedFile.size / 1024).toFixed(0) }} KB</span>
              <Button type="button" variant="ghost" size="sm" @click="removeSelected">
                Remove
              </Button>
            </div>
            <input
              ref="fileInput"
              type="file"
              accept=".pdf,.docx,.txt,.md"
              class="hidden"
              @change="onFileSelected"
            />
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-2">
              <Label for="doc-title">Title</Label>
              <Input id="doc-title" v-model="form.title" placeholder="People v. Juan, G.R. No. 143491" />
            </div>
            <div class="space-y-2">
              <Label for="doc-category" class="flex items-center gap-1">
                Category <span class="text-destructive">*</span>
              </Label>
              <Select v-model="form.category">
                <SelectTrigger id="doc-category" class="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="c in LEGAL_CATEGORIES" :key="c.value" :value="c.value">
                    {{ c.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
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

          <p v-if="uploadError" class="text-sm text-destructive">{{ uploadError }}</p>

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
      <Select :model-value="statusFilter" @update:model-value="statusFilter = String($event)">
        <SelectTrigger class="h-8 w-36">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All statuses</SelectItem>
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
              <p v-if="doc.law_name || doc.gr_number" class="mt-0.5 text-xs text-muted-foreground">
                {{ [doc.law_name, doc.gr_number].filter(Boolean).join(' · ') }}
              </p>
              <p v-if="doc.crawl_status === 'failed' && doc.last_error" class="mt-0.5 text-xs text-destructive">
                {{ doc.last_error }}
              </p>
            </TableCell>
            <TableCell>
              <span class="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
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
              {{ doc.promulgation_date || formatDate(doc.created_at) }}
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