<script setup lang="ts">
import { ArrowLeftIcon, CircleAlertIcon, FileTextIcon, FileUpIcon, Loader2Icon, XIcon } from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import { parseApiError } from '~/composables/useApiErrors'
import type { VettingRequestRecord } from '~/types/vetting'
import {
  VETTING_DOCUMENT_TYPE_SUGGESTIONS,
  VETTING_REGION_OPTIONS,
  VETTING_SERVICE_TYPES,
  VETTING_URGENCIES,
} from '~/utils/vetting'

definePageMeta({
  middleware: ['subscription'],
  layout: 'default',
})

interface DraftSource {
  id: string
  conversation_id: string
  conversation_title: string | null
  case_id: string | null
  case_title: string | null
  title: string
  content: string
  created_at: string
}

const api = useApi()
const route = useRoute()
const router = useRouter()

const submitting = ref(false)
const error = ref('')
const fieldErrors = ref<Record<string, string>>({})
const fileInput = ref<HTMLInputElement | null>(null)
const file = ref<File | null>(null)

/** The draft this request was started from, when the page was opened with one. */
const draft = ref<DraftSource | null>(null)
const draftLoading = ref(false)
const draftError = ref('')

const form = reactive({
  document_type: '',
  summary: '',
  jurisdiction: '',
  service_type: 'notarization' as 'vetting' | 'notarization',
  urgency: 'normal' as 'normal' | 'urgent',
  deadline_at: '',
  property_value: '',
})

function pickDocumentType(value: string) {
  form.document_type = value
  if (value === 'Other') form.document_type = ''
}

function onPickFile(event: Event) {
  const input = event.target as HTMLInputElement
  file.value = input.files?.[0] ?? null
}

/**
 * A draft carries its content as markdown, so it is rendered into a PDF and
 * handed to the lawyer as a .pdf file rather than forcing the submitter to
 * download and re-upload it.
 */
async function fileFromDraft(title: string, content: string): Promise<File> {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  const { buildPdfBlob } = await import('~/utils/pdf')
  const blob = await buildPdfBlob(content, title)
  return new File([blob], `${base || 'draft'}.pdf`, { type: 'application/pdf' })
}

/**
 * A request started from a draft comes in as `?draft=<generated-document-id>`.
 * The draft is fetched, its document type and summary are prefilled, and its
 * content is attached as the file, so the only thing left is jurisdiction and
 * submit.
 */
async function loadDraft() {
  const draftId = typeof route.query.draft === 'string' ? route.query.draft : null
  if (!draftId) return

  draftLoading.value = true
  draftError.value = ''
  try {
    const { data } = await api<{ data: DraftSource }>(`/generated-documents/${encodeURIComponent(draftId)}`)
    draft.value = data
    form.document_type = data.title.slice(0, 100)
    form.summary = `AI-drafted document ("${data.title}"). Please review it and notarize it.`
    file.value = await fileFromDraft(data.title, data.content)
  } catch (err: any) {
    draftError.value = parseApiError(err).message || 'Could not load the draft.'
  } finally {
    draftLoading.value = false
  }
}

function clearDraft() {
  draft.value = null
  draftError.value = ''
  file.value = null
  form.document_type = ''
  form.summary = ''
  void router.replace({ query: {} })
}

onMounted(loadDraft)

async function handleSubmit() {
  if (submitting.value) return

  const errors: Record<string, string> = {}
  if (form.document_type.trim() === '') errors.document_type = 'Enter the document type.'
  if (form.summary.trim() === '') errors.summary = 'Describe what the lawyer should review.'
  if (form.jurisdiction === '') errors.jurisdiction = 'Select the jurisdiction.'
  if (!file.value) errors.file = 'Upload the document.'

  fieldErrors.value = errors

  if (Object.keys(errors).length > 0) {
    error.value = 'Check the highlighted fields below.'
    return
  }

  submitting.value = true
  error.value = ''

  try {
    const body = new FormData()
    body.append('document_type', form.document_type.trim())
    body.append('summary', form.summary.trim())
    body.append('jurisdiction', form.jurisdiction)
    body.append('service_type', form.service_type)
    body.append('urgency', form.urgency)
    if (form.deadline_at) body.append('deadline_at', form.deadline_at)
    if (form.service_type === 'notarization' && form.property_value.trim() !== '') {
      body.append('property_value', form.property_value.trim())
    }
    if (file.value) body.append('file', file.value)

    const res = await api<{ data: VettingRequestRecord, checkout_url: string | null }>('/vetting-requests', {
      method: 'POST',
      body,
    })

    // A fee-bearing request answers with PayMongo's hosted checkout; once the
    // payment clears, the webhook starts matching. Free requests are already
    // matched by the time the response returns.
    if (res.checkout_url) {
      window.location.href = res.checkout_url
      return
    }

    toast.success('Request submitted — a lawyer will be matched shortly.')
    await navigateTo(`/vetting/${res.data.id}`)
  } catch (err: any) {
    const parsed = parseApiError(err)
    error.value = parsed.message
    if (Object.keys(parsed.fields).length > 0) {
      fieldErrors.value = { ...fieldErrors.value, ...parsed.fields }
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
    <NuxtLink to="/vetting" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeftIcon class="size-3.5" />
      Back to requests
    </NuxtLink>

    <PageHeader
      title="New vetting request"
      description="Upload the document, tell us what it is, and a verified lawyer will take it from there."
    />

    <div
      v-if="draft || draftLoading || draftError"
      class="mb-5 flex items-start gap-3 rounded-xl border p-4 text-sm"
      :class="draftError ? 'border-destructive/40 bg-destructive/5 text-destructive' : 'border-primary/30 bg-primary/5 text-foreground'"
    >
      <Loader2Icon v-if="draftLoading" class="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />
      <template v-else-if="draftError">
        <CircleAlertIcon class="mt-0.5 size-4 shrink-0 text-destructive" />
        <p class="min-w-0 flex-1 leading-snug">
          {{ draftError }}
        </p>
      </template>
      <template v-else>
        <FileTextIcon class="mt-0.5 size-4 shrink-0 text-primary" />
        <p class="min-w-0 flex-1 leading-snug">
          Prepared from your draft
          <span class="font-medium text-primary">{{ draft?.title }}</span>
          — its contents are attached. Adjust the details below, then submit.
        </p>
      </template>
      <button
        v-if="draft"
        type="button"
        class="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Start a fresh request instead"
        @click="clearDraft"
      >
        <XIcon class="size-4" />
      </button>
    </div>

    <form class="space-y-6" @submit.prevent="handleSubmit">
      <section class="space-y-5 rounded-2xl border bg-card p-6">
        <div class="space-y-1.5">
          <Label for="document-type">Document type</Label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="suggestion in VETTING_DOCUMENT_TYPE_SUGGESTIONS"
              :key="suggestion"
              type="button"
              class="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
              :class="form.document_type === suggestion ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'"
              @click="pickDocumentType(suggestion)"
            >
              {{ suggestion }}
            </button>
          </div>
          <Input
            v-model="form.document_type"
            class="mt-2"
            placeholder="Or type the document type…"
          />
          <p v-if="fieldErrors.document_type" class="text-xs text-destructive">{{ fieldErrors.document_type }}</p>
        </div>

        <div class="space-y-1.5">
          <Label for="summary">What should the lawyer review?</Label>
          <Textarea
            id="summary"
            v-model="form.summary"
            rows="4"
            maxlength="500"
            placeholder="Describe the document and anything you want the lawyer to check — e.g. a deed of sale for a Makati condo, verifying the title and the signatures."
          />
          <p v-if="fieldErrors.summary" class="text-xs text-destructive">{{ fieldErrors.summary }}</p>
        </div>
      </section>

      <section class="space-y-5 rounded-2xl border bg-card p-6">
        <div class="space-y-2">
          <Label>Service</Label>
          <div class="space-y-2">
            <button
              v-for="service in VETTING_SERVICE_TYPES"
              :key="service.value"
              type="button"
              class="flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors"
              :class="form.service_type === service.value ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-primary/40'"
              @click="form.service_type = service.value as 'vetting' | 'notarization'"
            >
              <span class="mt-0.5 size-3.5 shrink-0 rounded-full border-2" :class="form.service_type === service.value ? 'border-primary bg-primary' : 'border-muted-foreground/40'" />
              <span>
                <span class="block text-sm font-medium">{{ service.label }}</span>
                <span class="mt-0.5 block text-xs text-muted-foreground">{{ service.description }}</span>
              </span>
            </button>
          </div>
        </div>

        <div v-if="form.service_type === 'notarization'" class="space-y-1.5">
          <Label for="property-value">Property / contract value (₱)</Label>
          <Input
            id="property-value"
            v-model="form.property_value"
            type="number"
            min="0"
            step="0.01"
            inputmode="decimal"
            placeholder="e.g. 2500000"
          />
          <p class="text-xs text-muted-foreground">
            Used to compute the notarization fee for deeds and leases (1% of the declared value, minimum ₱1,500).
          </p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-1.5">
            <Label for="jurisdiction">Jurisdiction</Label>
            <Select v-model="form.jurisdiction">
              <SelectTrigger id="jurisdiction" class="w-full">
                <SelectValue placeholder="Select a region" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="r in VETTING_REGION_OPTIONS" :key="r.value" :value="r.value">
                  {{ r.label }}
                </SelectItem>
              </SelectContent>
            </Select>
            <p v-if="fieldErrors.jurisdiction" class="text-xs text-destructive">{{ fieldErrors.jurisdiction }}</p>
          </div>
          <div class="space-y-1.5">
            <Label for="urgency">Priority</Label>
            <Select v-model="form.urgency">
              <SelectTrigger id="urgency" class="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="u in VETTING_URGENCIES" :key="u.value" :value="u.value">
                  {{ u.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div class="space-y-1.5">
          <Label for="deadline">Deadline (optional)</Label>
          <Input id="deadline" v-model="form.deadline_at" type="datetime-local" />
          <p class="text-xs text-muted-foreground">Only used to prioritize; the lawyer confirms the actual schedule.</p>
        </div>
      </section>

      <section class="space-y-5 rounded-2xl border bg-card p-6">
        <div>
          <h2 class="font-heading text-base font-semibold">Document</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">
            PDF, DOCX, TXT, MD, JPG, PNG, or WebP. Encrypted and only visible to your matched lawyer.
          </p>
        </div>
        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-xl border border-dashed p-4 text-left text-sm transition-colors hover:border-primary/50"
          @click="fileInput?.click()"
        >
          <FileUpIcon class="size-5 shrink-0 text-muted-foreground" />
          <span class="min-w-0 truncate">{{ file?.name ?? 'Choose a file to upload' }}</span>
        </button>
        <input ref="fileInput" type="file" accept=".pdf,.docx,.txt,.md,image/jpeg,image/png,image/webp" class="hidden" @change="onPickFile">
        <p v-if="fieldErrors.file" class="text-xs text-destructive">{{ fieldErrors.file }}</p>
      </section>

      <div v-if="error" class="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {{ error }}
      </div>

      <Button type="submit" size="lg" class="w-full" :disabled="submitting">
        <Loader2Icon v-if="submitting" class="size-4 animate-spin" />
        {{ submitting ? 'Submitting…' : 'Submit request' }}
      </Button>
    </form>
  </div>
</template>