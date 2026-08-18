<script setup lang="ts">
import {
  ArrowLeftIcon,
  CalendarPlusIcon,
  CheckCheckIcon,
  ClipboardCheckIcon,
  DownloadIcon,
  FileSearchIcon,
  Loader2Icon,
  MessageCircleIcon,
  ScaleIcon,
  XIcon,
} from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import { authHeaders } from '~/lib/http'
import type { VettingMessage, VettingRequestRecord } from '~/types/vetting'
import { timeAgo } from '~/utils/time'

definePageMeta({
  middleware: ['lawyer'],
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
const busy = ref<string | null>(null)

const messageBody = ref('')
const sendingMessage = ref(false)

const scheduleOpen = ref(false)
const scheduleForm = reactive({ scheduled_at: '', session_link: '' })
const scheduling = ref(false)

const notarizeOpen = ref(false)
const notarizeForm = reactive({
  signer_name: '',
  id_type: '',
  id_number: '',
  verification_method: 'video',
  session_recording_ref: '',
})
const notarizing = ref(false)

const fileUrl = ref<string | null>(null)
const fileLoading = ref(false)
const fileError = ref('')

const canViewDocument = computed(() => {
  if (!request.value) return false
  return request.value.assigned_lawyer?.id === auth.user?.id
    && ['accepted', 'under_review', 'vetted', 'notarized', 'completed'].includes(request.value.status)
})

async function loadRequest() {
  loading.value = true
  try {
    const res = await api<{ data: VettingRequestRecord }>(`/lawyer/vetting-requests/${route.params.id}`)
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
    // The thread can fail for a stranger; the rest of the page still works.
  } finally {
    loadingMessages.value = false
  }
}

async function runAction(action: string, path: string, body?: Record<string, unknown>, method: 'POST' | 'PATCH' = 'POST') {
  if (busy.value) return
  busy.value = action
  try {
    const res = await api<{ data: VettingRequestRecord }>(path, { method, body })
    request.value = res.data
    return res.data
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'That action could not be completed.')
  } finally {
    busy.value = null
  }
}

function accept() {
  return runAction('accept', `/lawyer/vetting-requests/${route.params.id}/accept`)
}

function decline() {
  return runAction('decline', `/lawyer/vetting-requests/${route.params.id}/decline`)
}

function markStatus(status: 'under_review' | 'vetted') {
  return runAction(`mark-${status}`, `/lawyer/vetting-requests/${route.params.id}/status`, { status }, 'PATCH')
}

function openSchedule() {
  scheduleOpen.value = true
  notarizeOpen.value = false
}

async function saveSchedule() {
  if (scheduling.value) return
  scheduling.value = true
  try {
    const res = await api<{ data: VettingRequestRecord }>(`/lawyer/vetting-requests/${route.params.id}/schedule`, {
      method: 'POST',
      body: {
        scheduled_at: scheduleForm.scheduled_at || null,
        session_link: scheduleForm.session_link || null,
      },
    })
    request.value = res.data
    scheduleOpen.value = false
    toast.success('Notarization session scheduled')
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not schedule the session.')
  } finally {
    scheduling.value = false
  }
}

function openNotarize() {
  notarizeOpen.value = true
  scheduleOpen.value = false
}

async function submitNotarize() {
  if (notarizing.value) return
  notarizing.value = true
  try {
    const res = await api<{ data: VettingRequestRecord }>(`/lawyer/vetting-requests/${route.params.id}/notarize`, {
      method: 'POST',
      body: {
        signer_name: notarizeForm.signer_name,
        id_type: notarizeForm.id_type,
        id_number: notarizeForm.id_number,
        verification_method: notarizeForm.verification_method,
        session_recording_ref: notarizeForm.session_recording_ref || null,
      },
    })
    request.value = res.data
    notarizeOpen.value = false
    toast.success('Notarization recorded in the journal')
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not record the notarization.')
  } finally {
    notarizing.value = false
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

async function openDocument() {
  if (fileUrl.value) return
  if (!request.value) return
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

  const url = fileUrl.value ?? (await openBlob())
  const filename = request.value.document?.original_filename ?? `document-${request.value.id}.pdf`
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

async function openBlob() {
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

const statusTone: Record<string, string> = {
  payment_pending: 'bg-muted text-muted-foreground',
  matched: 'bg-primary/10 text-primary',
  accepted: 'bg-forest/10 text-forest dark:bg-cream/10 dark:text-peach',
  under_review: 'bg-espresso/10 text-espresso dark:bg-cream/10 dark:text-peach',
  vetted: 'bg-primary/10 text-primary',
  notarized: 'bg-forest/10 text-forest dark:bg-cream/10 dark:text-peach',
  completed: 'bg-forest/10 text-forest dark:bg-cream/10 dark:text-peach',
  cancelled: 'bg-muted text-muted-foreground',
  declined: 'bg-destructive/10 text-destructive',
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
  <div class="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
    <NuxtLink to="/lawyer/dashboard" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeftIcon class="size-3.5" />
      Back to workspace
    </NuxtLink>

    <ListSkeleton v-if="loading" :rows="4" />

    <template v-else-if="request">
      <PageHeader :title="request.document_type" :description="request.summary">
        <template #actions>
          <Badge :class="statusTone[request.status] ?? 'bg-muted text-muted-foreground'">
            {{ request.status_label }}
          </Badge>
        </template>
      </PageHeader>

      <div class="grid gap-6 lg:grid-cols-3">
        <div class="space-y-6 lg:col-span-2">
          <!-- Request details -->
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
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Urgency</p>
                <p class="mt-0.5 text-sm font-medium">{{ request.urgency_label }}</p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Jurisdiction</p>
                <p class="mt-0.5 text-sm font-medium">{{ request.jurisdiction }}</p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Submitted by</p>
                <p class="mt-0.5 text-sm font-medium">{{ request.submitter?.name ?? '—' }}</p>
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
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Session scheduled</p>
                <p class="mt-0.5 text-sm font-medium">{{ formatDateTime(request.session_scheduled_at) }}</p>
              </div>
              <div v-if="request.certificate_number">
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Certificate</p>
                <p class="mt-0.5 text-sm font-medium">{{ request.certificate_number }}</p>
              </div>
            </CardContent>
          </Card>

          <!-- Document -->
          <Card>
            <CardHeader>
              <CardTitle class="flex items-center gap-2">
                <FileSearchIcon class="size-4 text-muted-foreground" />
                Document
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p v-if="!canViewDocument" class="text-sm text-muted-foreground">
                The full document becomes available once you accept the request.
              </p>
              <template v-else>
                <div class="flex flex-wrap gap-2">
                  <Button variant="outline" :disabled="fileLoading" @click="openDocument">
                    <Loader2Icon v-if="fileLoading" class="size-4 animate-spin" />
                    {{ fileUrl ? 'Document loaded' : 'Open document' }}
                  </Button>
                  <Button variant="ghost" class="gap-2" :disabled="fileLoading" @click="downloadDocument">
                    <DownloadIcon class="size-4" />
                    Download
                  </Button>
                </div>
                <p v-if="fileError" class="mt-2 text-sm text-destructive">{{ fileError }}</p>
                <iframe
                  v-if="fileUrl"
                  :src="fileUrl"
                  class="mt-4 h-[480px] w-full rounded-xl border"
                  title="Requested document"
                />
              </template>
            </CardContent>
          </Card>

          <!-- Clarification thread -->
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
                  description="Ask the submitter for anything you need to review the document."
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
                  placeholder="Ask a question or share your findings…"
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
        </div>

        <!-- Action rail -->
        <div class="space-y-4">
          <Card v-if="request.my_match === 'notified' && request.status === 'matched'">
            <CardHeader>
              <CardTitle class="flex items-center gap-2">
                <ScaleIcon class="size-4 text-muted-foreground" />
                Your offer
              </CardTitle>
              <CardDescription>
                Accepting locks this request to you and notifies the submitter. Declining lets it go to another lawyer.
              </CardDescription>
            </CardHeader>
            <CardContent class="space-y-2">
              <Button class="w-full gap-2" :disabled="busy !== null" @click="accept()">
                <Loader2Icon v-if="busy === 'accept'" class="size-4 animate-spin" />
                <CheckCheckIcon v-else class="size-4" />
                Accept request
              </Button>
              <Button variant="outline" class="w-full gap-2" :disabled="busy !== null" @click="decline()">
                <Loader2Icon v-if="busy === 'decline'" class="size-4 animate-spin" />
                <XIcon v-else class="size-4" />
                Decline
              </Button>
            </CardContent>
          </Card>

          <Card v-else-if="request.assigned_lawyer?.id === auth.user?.id">
            <CardHeader>
              <CardTitle class="flex items-center gap-2">
                <ClipboardCheckIcon class="size-4 text-muted-foreground" />
                Progress
              </CardTitle>
            </CardHeader>
            <CardContent class="space-y-2">
              <template v-if="request.status === 'accepted'">
                <Button class="w-full" :disabled="busy !== null" @click="markStatus('under_review')">
                  <Loader2Icon v-if="busy === 'mark-under_review'" class="size-4 animate-spin" />
                  Start review
                </Button>
              </template>

              <template v-else-if="request.status === 'under_review'">
                <Button class="w-full" :disabled="busy !== null" @click="markStatus('vetted')">
                  <Loader2Icon v-if="busy === 'mark-vetted'" class="size-4 animate-spin" />
                  Mark as vetted
                </Button>
              </template>

              <template v-else-if="request.status === 'vetted' && request.service_type === 'notarization'">
                <template v-if="!scheduleOpen && !notarizeOpen">
                  <Button class="w-full gap-2" :disabled="busy !== null" @click="openSchedule">
                    <CalendarPlusIcon class="size-4" />
                    Schedule notarization
                  </Button>
                </template>
              </template>

              <p v-if="request.status === 'vetted' && request.service_type === 'vetting'" class="text-sm text-muted-foreground">
                This request completes automatically now that the document is vetted.
              </p>

              <template v-if="request.session_scheduled_at && request.status === 'vetted'">
                <div class="rounded-xl border bg-muted/40 p-3 text-sm">
                  <p class="font-medium">Session scheduled</p>
                  <p class="mt-0.5 text-muted-foreground">{{ formatDateTime(request.session_scheduled_at) }}</p>
                  <a
                    v-if="request.session_link"
                    :href="request.session_link"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="mt-1 inline-block text-primary underline-offset-2 hover:underline"
                  >
                    Open session link
                  </a>
                </div>
                <Button class="w-full gap-2" :disabled="busy !== null" @click="openNotarize">
                  <CheckCheckIcon class="size-4" />
                  Record notarization
                </Button>
              </template>

              <template v-if="request.status === 'notarized'">
                <p class="text-sm text-muted-foreground">Notarization recorded. The request is complete.</p>
              </template>
            </CardContent>
          </Card>

          <!-- Schedule form -->
          <Card v-if="scheduleOpen">
            <CardHeader>
              <CardTitle class="text-base">Schedule the session</CardTitle>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="space-y-1.5">
                <Label for="scheduled-at">Date and time</Label>
                <Input id="scheduled-at" v-model="scheduleForm.scheduled_at" type="datetime-local" />
              </div>
              <div class="space-y-1.5">
                <Label for="session-link">Session link (optional)</Label>
                <Input id="session-link" v-model="scheduleForm.session_link" type="url" placeholder="https://meet.example.com/…" />
              </div>
              <div class="flex gap-2">
                <Button class="flex-1" :disabled="scheduling" @click="saveSchedule">
                  <Loader2Icon v-if="scheduling" class="size-4 animate-spin" />
                  Save
                </Button>
                <Button variant="ghost" :disabled="scheduling" @click="scheduleOpen = false">Cancel</Button>
              </div>
            </CardContent>
          </Card>

          <!-- Notarize form -->
          <Card v-if="notarizeOpen">
            <CardHeader>
              <CardTitle class="text-base">Record the notarization</CardTitle>
              <CardDescription>Captured into your notarial journal with a certificate number.</CardDescription>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="space-y-1.5">
                <Label for="signer-name">Signer name</Label>
                <Input id="signer-name" v-model="notarizeForm.signer_name" placeholder="Full name as shown on their ID" />
              </div>
              <div class="grid gap-3 sm:grid-cols-2">
                <div class="space-y-1.5">
                  <Label for="id-type">ID type</Label>
                  <Input id="id-type" v-model="notarizeForm.id_type" placeholder="e.g. Passport" />
                </div>
                <div class="space-y-1.5">
                  <Label for="id-number">ID number</Label>
                  <Input id="id-number" v-model="notarizeForm.id_number" />
                </div>
              </div>
              <div class="space-y-1.5">
                <Label for="verification-method">Verification method</Label>
                <Input id="verification-method" v-model="notarizeForm.verification_method" />
              </div>
              <div class="flex gap-2">
                <Button class="flex-1" :disabled="notarizing" @click="submitNotarize">
                  <Loader2Icon v-if="notarizing" class="size-4 animate-spin" />
                  Record
                </Button>
                <Button variant="ghost" :disabled="notarizing" @click="notarizeOpen = false">Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </template>
  </div>
</template>