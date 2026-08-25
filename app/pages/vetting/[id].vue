<script setup lang="ts">
import {
  ArrowLeftIcon,
  CreditCardIcon,
  DownloadIcon,
  FileSearchIcon,
  Loader2Icon,
  MessageCircleIcon,
  RefreshCcwIcon,
  ScaleIcon,
  XIcon,
} from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import { authHeaders } from '~/lib/http'
import type { VettingMessage, VettingRequestRecord } from '~/types/vetting'
import { timeAgo } from '~/utils/time'

definePageMeta({
  middleware: ['subscription'],
  layout: 'default',
})

const route = useRoute()
const api = useApi()
const auth = useAuthStore()

const {
  public: { apiBase },
} = useRuntimeConfig()

const request = ref<VettingRequestRecord | null>(null)
const messages = ref<VettingMessage[]>([])
const loading = ref(true)
const loadingMessages = ref(false)
const cancelling = ref(false)
const messageBody = ref('')
const sendingMessage = ref(false)
const retrying = ref(false)
const fileUrl = ref<string | null>(null)
const fileLoading = ref(false)
const fileError = ref('')

const canCancel = computed(() => {
  const status = request.value?.status
  return status === 'payment_pending' || status === 'pending' || status === 'matched' || status === 'waiting'
})

async function loadRequest() {
  loading.value = true
  try {
    const res = await api<{ data: VettingRequestRecord }>(`/vetting-requests/${route.params.id}`)
    request.value = res.data
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not load this request.')
  } finally {
    loading.value = false
  }
}

async function loadMessages() {
  loadingMessages.value = true
  try {
    const res = await api<{ data: VettingMessage[] }>(`/vetting-requests/${route.params.id}/messages`)
    messages.value = res.data
  } catch {
    // Thread access requires an assignment; before then it is empty.
  } finally {
    loadingMessages.value = false
  }
}

async function sendMessage() {
  const body = messageBody.value.trim()
  if (!body || sendingMessage.value) return
  sendingMessage.value = true
  try {
    await api(`/vetting-requests/${route.params.id}/messages`, { method: 'POST', body: { body } })
    messageBody.value = ''
    await loadMessages()
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not send the message.')
  } finally {
    sendingMessage.value = false
  }
}

async function cancelRequest() {
  if (cancelling.value) return
  cancelling.value = true
  try {
    const res = await api<{ data: VettingRequestRecord }>(`/vetting-requests/${route.params.id}/cancel`, {
      method: 'POST',
      body: { reason: 'Cancelled by the submitter.' },
    })
    request.value = res.data
    toast.success('Request cancelled')
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not cancel the request.')
  } finally {
    cancelling.value = false
  }
}

async function retryMatching() {
  if (retrying.value) return
  retrying.value = true
  try {
    const res = await api<{ data: VettingRequestRecord }>(`/vetting-requests/${route.params.id}/retry`, {
      method: 'POST',
    })
    request.value = res.data
    if (res.data.status === 'matched') toast.success('A lawyer has been offered your request.')
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not retry matching right now.')
  } finally {
    retrying.value = false
  }
}

function payNow() {
  if (request.value?.gateway_checkout_url) {
    window.location.href = request.value.gateway_checkout_url
  }
}

async function openDocument() {
  if (fileUrl.value) return
  fileLoading.value = true
  fileError.value = ''
  try {
    const response = await fetch(`${apiBase}/api/vetting-requests/${route.params.id}/file`, {
      headers: await authHeaders(),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const blob = await response.blob()
    fileUrl.value = URL.createObjectURL(blob)
  } catch {
    fileError.value = 'The document could not be opened right now.'
  } finally {
    fileLoading.value = false
  }
}

async function downloadDocument() {
  if (!request.value) return
  const url = fileUrl.value ?? (await openDocumentBlob())
  const a = document.createElement('a')
  a.href = url
  a.download = request.value.document?.original_filename ?? `document-${request.value.id}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
}

async function openDocumentBlob() {
  fileLoading.value = true
  try {
    const response = await fetch(`${apiBase}/api/vetting-requests/${route.params.id}/file`, {
      headers: await authHeaders(),
    })
    const blob = await response.blob()
    return URL.createObjectURL(blob)
  } finally {
    fileLoading.value = false
  }
}

function formatFee(value: number) {
  if (!value) return '—'
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value / 100)
}

function formatDateTime(value: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

onMounted(() => {
  void loadRequest()
  void loadMessages()
})
</script>

<template>
  <div class="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
    <NuxtLink to="/vetting" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeftIcon class="size-3.5" />
      Back to requests
    </NuxtLink>

    <ListSkeleton v-if="loading" :rows="4" />

    <template v-else-if="request">
      <PageHeader :title="request.document_type" :description="request.summary">
        <template #actions>
          <StatusBadge :status="request.status" :label="request.status_label" />
        </template>
      </PageHeader>

      <div class="space-y-6">
        <!-- Payment / matching banner -->
        <div v-if="request.status === 'payment_pending'" class="rounded-xl border border-border bg-card p-5">
          <div class="flex flex-wrap items-center gap-4">
            <div class="min-w-0 flex-1">
              <p class="font-medium">Payment required</p>
              <p class="mt-0.5 text-sm text-muted-foreground">
                Complete payment of {{ formatFee(request.total_fee) }} to start matching with a lawyer.
              </p>
            </div>
            <Button
              v-if="request.gateway_checkout_url"
              class="gap-2"
              @click="payNow"
            >
              <CreditCardIcon class="size-4" />
              Pay now
            </Button>
          </div>
        </div>

        <!-- Waiting for a lawyer -->
        <div v-if="request.status === 'waiting'" class="rounded-xl border border-border bg-card p-5">
          <div class="flex flex-wrap items-center gap-4">
            <div class="min-w-0 flex-1">
              <p class="font-medium">No lawyer is available right now</p>
              <p class="mt-0.5 text-sm text-muted-foreground">
                Your request stays open and your fee stays safe. We will match you as soon as a lawyer comes online, or you can try again.
              </p>
            </div>
            <Button variant="outline" class="gap-2" :disabled="retrying" @click="retryMatching">
              <Loader2Icon v-if="retrying" class="size-4 animate-spin" />
              <RefreshCcwIcon v-else class="size-4" />
              Try again
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <FileSearchIcon class="size-4 text-muted-foreground" />
              Request details
            </CardTitle>
          </CardHeader>
          <CardContent class="grid gap-4 sm:grid-cols-2">
            <div>
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Service</p>
              <p class="mt-0.5 text-sm font-medium">{{ request.service_type_label }}</p>
            </div>
            <div>
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Assigned lawyer</p>
              <p class="mt-0.5 text-sm font-medium">{{ request.assigned_lawyer?.name ?? 'Finding a match…' }}</p>
            </div>
            <div>
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Submitted</p>
              <p class="mt-0.5 text-sm font-medium">{{ formatDateTime(request.created_at) }}</p>
            </div>
            <div>
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Fee</p>
              <p class="mt-0.5 text-sm font-medium">{{ formatFee(request.total_fee) }}</p>
            </div>
            <div v-if="request.session_scheduled_at">
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Notarization session</p>
              <p class="mt-0.5 text-sm font-medium">{{ formatDateTime(request.session_scheduled_at) }}</p>
              <a
                v-if="request.session_link"
                :href="request.session_link"
                target="_blank"
                rel="noopener noreferrer"
                class="mt-0.5 inline-block text-sm text-primary underline-offset-2 hover:underline"
              >
                Join session
              </a>
            </div>
            <div v-if="request.certificate_number">
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Certificate</p>
              <p class="mt-0.5 text-sm font-medium">{{ request.certificate_number }}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <FileSearchIcon class="size-4 text-muted-foreground" />
              Your document
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div class="flex flex-wrap gap-2">
              <Button variant="outline" :disabled="fileLoading" @click="openDocument">
                <Loader2Icon v-if="fileLoading" class="size-4 animate-spin" />
                {{ fileUrl ? 'Document loaded' : 'View document' }}
              </Button>
              <Button variant="ghost" class="gap-2" :disabled="fileLoading" @click="downloadDocument">
                <DownloadIcon class="size-4" />
                Download
              </Button>
            </div>
            <p v-if="fileError" class="mt-2 text-sm text-destructive">{{ fileError }}</p>
            <iframe v-if="fileUrl" :src="fileUrl" class="mt-4 h-[480px] w-full rounded-xl border" title="Uploaded document" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <MessageCircleIcon class="size-4 text-muted-foreground" />
              Clarifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div class="space-y-4">
              <div v-if="loadingMessages" class="py-6 text-center text-sm text-muted-foreground">Loading…</div>
              <EmptyState
                v-else-if="messages.length === 0"
                :icon="MessageCircleIcon"
                title="No messages yet"
                description="Your lawyer may ask for clarifications here while reviewing."
              />
              <div v-else class="space-y-3">
                <div
                  v-for="m in messages"
                  :key="m.id"
                  class="rounded-xl border p-3"
                  :class="m.author?.id === auth.user?.id ? 'border-primary/30 bg-primary/5' : 'bg-muted/40'"
                >
                  <p class="text-xs font-medium">
                    {{ m.author?.name ?? 'Unknown' }}
                    <span class="font-normal text-muted-foreground">· {{ timeAgo(m.created_at) }}</span>
                  </p>
                  <p class="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{{ m.body }}</p>
                </div>
              </div>
            </div>

            <form class="mt-4 flex items-end gap-2" @submit.prevent="sendMessage">
              <Textarea
                v-model="messageBody"
                rows="2"
                maxlength="2000"
                placeholder="Reply to your lawyer…"
                class="flex-1"
              />
              <Button type="submit" :disabled="!messageBody.trim() || sendingMessage">
                <Loader2Icon v-if="sendingMessage" class="size-4 animate-spin" />
                <MessageCircleIcon v-else class="size-4" />
                Send
              </Button>
            </form>
          </CardContent>
        </Card>

        <div v-if="canCancel" class="flex justify-end">
          <Button variant="outline" class="gap-2 text-destructive hover:text-destructive" :disabled="cancelling" @click="cancelRequest">
            <Loader2Icon v-if="cancelling" class="size-4 animate-spin" />
            <XIcon v-else class="size-4" />
            Cancel request
          </Button>
        </div>
      </div>
    </template>
  </div>
</template>