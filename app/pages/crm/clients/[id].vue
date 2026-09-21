<script setup lang="ts">
import { ArchiveIcon, ArrowLeftIcon, BriefcaseBusinessIcon, Edit3Icon, LinkIcon, RefreshCwIcon, RotateCcwIcon, UserRoundIcon, XIcon } from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import type { Client, ClientInput } from '~/types/client'
import type { LegalCase } from '~/stores/cases'

definePageMeta({ middleware: ['auth', 'onboarding', 'subscription', 'terms'] })

const route = useRoute()
const router = useRouter()
const store = useClientStore()
const client = computed(() => store.current)
const showForm = ref(false)
const confirmArchive = ref(false)
const actionBusy = ref(false)
const api = useApi()
const cases = ref<LegalCase[]>([])
const selectedCase = ref('')
const relationshipType = ref<'primary_client' | 'additional_client'>('additional_client')
const relationshipError = ref('')
const replacementClientId = ref('')
const replacementOptions = ref<Array<{ value: string; label: string }>>([])
const replacementCaseId = ref('')
const showReplacementDialog = ref(false)
const state = ref<'loading' | 'ready' | 'missing' | 'forbidden' | 'unauthorized' | 'error'>('loading')

function statusOf(error: unknown) {
  return (error as { status?: number; statusCode?: number } | undefined)?.status
    ?? (error as { statusCode?: number } | undefined)?.statusCode
}

async function load() {
  state.value = 'loading'

  try {
    await store.fetchClient(String(route.params.id), { archived: route.query.archived === '1' })
    if (!client.value?.archived_at) {
      const response = await api<{ data: LegalCase[] }>('/cases?per_page=100&archived=0')
      cases.value = response.data
    }
    state.value = 'ready'
  } catch (error) {
    const status = statusOf(error)
    state.value = status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : status === 404 ? 'missing' : 'error'
  }
}

const availableCases = computed(() => cases.value.filter(candidate => !client.value?.linked_cases?.some(link => link.case_id === candidate.id)))
const caseOptions = computed(() => availableCases.value.map(candidate => ({ value: candidate.id, label: `${candidate.title}${candidate.reference ? ` · ${candidate.reference}` : ''}` })))

async function attachCase() {
  if (!client.value || !selectedCase.value) return
  relationshipError.value = ''
  try {
    await store.attachCase(client.value.id, selectedCase.value, relationshipType.value)
    selectedCase.value = ''
    toast.success('Case linked')
  } catch (error) {
    relationshipError.value = (error as { data?: { message?: string } })?.data?.message ?? 'Could not link this case.'
  }
}

async function detachCase(caseId: string) {
  if (!client.value || !window.confirm('Remove this case link?')) return
  relationshipError.value = ''
  try {
    await store.detachCase(client.value.id, caseId)
    toast.success('Case link removed')
  } catch (error) {
    const failure = error as { status?: number; statusCode?: number; data?: { code?: string; message?: string } }
    const status = failure.status ?? failure.statusCode
    if (status === 409 && failure.data?.code === 'primary_replacement_required') {
      await loadReplacementOptions(caseId)
      return
    }
    relationshipError.value = (error as { data?: { message?: string } })?.data?.message ?? 'Could not remove this case link.'
  }
}

async function loadReplacementOptions(caseId: string) {
  try {
    const response = await api<{ data: Array<{ client_id: string; client?: { id: string; display_name: string } | null }> }>(`/cases/${encodeURIComponent(caseId)}/clients?per_page=100`)
    replacementOptions.value = response.data
      .filter(link => link.client_id !== client.value?.id && link.client)
      .map(link => ({ value: link.client_id, label: link.client!.display_name }))
    replacementClientId.value = ''
    replacementCaseId.value = caseId
    showReplacementDialog.value = true
  } catch (error) {
    relationshipError.value = (error as { data?: { message?: string } })?.data?.message ?? 'Could not load replacement clients.'
  }
}

async function confirmReplacement() {
  if (!client.value || !replacementCaseId.value || !replacementClientId.value) return
  relationshipError.value = ''
  try {
    await store.detachCase(client.value.id, replacementCaseId.value, replacementClientId.value)
    showReplacementDialog.value = false
    toast.success('Case link removed')
  } catch (error) {
    relationshipError.value = (error as { data?: { message?: string } })?.data?.message ?? 'Could not remove this case link.'
  }
}

onMounted(() => void load())

const canEdit = computed(() => client.value?.capabilities?.update !== false && !client.value?.archived_at)
const canArchive = computed(() => client.value?.capabilities?.archive !== false && !client.value?.archived_at)
const canRestore = computed(() => client.value?.capabilities?.restore === true && !!client.value?.archived_at)

async function save(payload: ClientInput) {
  actionBusy.value = true

  try {
    await store.updateClient(client.value!.id, payload)
    showForm.value = false
    toast.success('Client updated')
  } catch (error) {
    toast.error((error as { data?: { message?: string } })?.data?.message ?? 'Could not update the client.')
  } finally {
    actionBusy.value = false
  }
}

async function archive() {
  actionBusy.value = true

  try {
    await store.archiveClient(client.value!.id)
    confirmArchive.value = false
    toast.success('Client archived')
  } catch {
    toast.error('Could not archive the client. Try again.')
  } finally {
    actionBusy.value = false
  }
}

async function restore() {
  actionBusy.value = true

  try {
    await store.restoreClient(client.value!.id)
    toast.success('Client restored')
  } catch {
    toast.error('Could not restore the client. Try again.')
  } finally {
    actionBusy.value = false
  }
}
</script>

<template>
  <main class="mx-auto w-full max-w-5xl px-4 pt-8 pb-6 sm:px-6">
    <div v-if="state === 'loading'" aria-busy="true" class="space-y-4">
      <Skeleton class="h-32 rounded-xl" />
      <Skeleton class="h-48 rounded-xl" />
    </div>

    <div v-else-if="state === 'error'" class="surface-inset py-16 text-center">
      <RefreshCwIcon class="mx-auto size-7 text-muted-foreground" />
      <h1 class="mt-3 text-lg font-semibold">Client profile could not load</h1>
      <Button variant="outline" class="mt-5 min-h-11" @click="load">Retry</Button>
    </div>

    <div v-else-if="state === 'unauthorized'" class="surface-inset py-16 text-center">
      <h1 class="text-lg font-semibold">Your session has ended</h1>
      <p class="mt-2 text-sm text-muted-foreground">Sign in again to continue.</p>
      <NuxtLink to="/login" class="mt-5 inline-flex"><Button class="min-h-11">Sign in</Button></NuxtLink>
    </div>

    <div v-else-if="state === 'forbidden' || state === 'missing'" class="surface-inset py-16 text-center">
      <h1 class="text-lg font-semibold">Client profile unavailable</h1>
      <p class="mt-2 text-sm text-muted-foreground">This profile is unavailable or you do not have permission to view it.</p>
      <Button variant="outline" class="mt-5 min-h-11" @click="router.push('/crm/clients')">Back to clients</Button>
    </div>

    <template v-else-if="client">
      <div class="mb-5">
        <button type="button" class="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50" @click="router.push('/crm/clients')">
          <ArrowLeftIcon class="size-4" />
          Clients
        </button>
      </div>

      <header class="surface hero-gradient p-5 sm:p-6">
        <div class="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div class="flex items-start gap-3">
            <span class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <component :is="client.client_type === 'person' ? UserRoundIcon : BriefcaseBusinessIcon" class="size-5" />
            </span>
            <div>
              <p class="text-label">CRM / Clients</p>
              <h1 class="text-h1 font-semibold">{{ client.display_name }}</h1>
              <div class="mt-2 flex flex-wrap gap-2 text-xs">
                <span class="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">{{ client.client_type === 'person' ? 'Person' : 'Organization' }}</span>
                <span class="rounded-full bg-muted px-2.5 py-1">{{ client.lifecycle }}</span>
                <span v-if="client.archived_at" class="rounded-full bg-muted px-2.5 py-1">Archived</span>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <Button v-if="canEdit" variant="outline" class="min-h-11 gap-1.5" @click="showForm = true">
              <Edit3Icon class="size-4" />
              Edit
            </Button>
            <Button v-if="canArchive" variant="outline" class="min-h-11 gap-1.5" @click="confirmArchive = true">
              <ArchiveIcon class="size-4" />
              Archive
            </Button>
            <Button v-if="canRestore" class="min-h-11 gap-1.5" :loading="actionBusy" @click="restore">
              <RotateCcwIcon class="size-4" />
              Restore
            </Button>
          </div>
        </div>

        <p v-if="client.archived_at" class="mt-5 border-t border-border/70 pt-4 text-sm text-muted-foreground">
          This client is archived and read-only. Linked cases, documents, conversations, tasks, links, and audit history are preserved.
        </p>
      </header>

      <div class="mt-5 space-y-5">
        <section class="surface p-5">
          <h2 class="text-lg font-semibold">Contact and notes</h2>
          <dl class="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt class="text-label">Email</dt>
              <dd class="mt-1 text-sm">{{ client.contact?.email || 'Not provided' }}</dd>
            </div>
            <div>
              <dt class="text-label">Phone</dt>
              <dd class="mt-1 text-sm">{{ client.contact?.phone || 'Not provided' }}</dd>
            </div>
          </dl>
          <div class="mt-5 border-t pt-4">
            <h3 class="text-label">Notes</h3>
            <p class="mt-1 whitespace-pre-line text-sm text-muted-foreground">{{ client.notes || 'No notes yet.' }}</p>
          </div>
        </section>

        <section class="surface p-5">
          <h2 class="text-lg font-semibold">Pipeline items</h2>
          <div v-if="client.pipeline_items?.length" class="mt-4 divide-y">
            <NuxtLink v-for="item in client.pipeline_items" :key="item.id" to="/crm" class="block py-3 first:pt-0 hover:text-primary">
              <p class="text-sm font-medium">{{ item.title }}</p>
              <p class="mt-1 text-xs text-muted-foreground">{{ item.pipeline?.name || 'Pipeline' }} · {{ item.stage?.name || 'Stage' }}</p>
            </NuxtLink>
          </div>
          <div v-else class="mt-4 rounded-lg border border-dashed p-6 text-center">
            <p class="text-sm text-muted-foreground">No pipeline items yet.</p>
            <Button variant="outline" class="mt-4 min-h-11" @click="router.push('/crm')">Go to intake</Button>
          </div>
        </section>

        <section class="surface p-5">
          <h2 class="text-lg font-semibold">Linked cases</h2>
          <p class="mt-1 text-sm text-muted-foreground">Legacy related parties are case context and are not confirmed client links.</p>
          <div v-if="!client.archived_at && client.capabilities?.update !== false" class="mt-4 rounded-lg border border-dashed p-4">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div class="min-w-0 flex-1">
                <label for="link-case" class="text-sm font-medium">Link a visible case</label>
                <SearchableSelect id="link-case" v-model="selectedCase" :options="caseOptions" placeholder="Select a case…" search-placeholder="Search cases…" empty-label="No unlinked cases found." class="mt-1.5" />
              </div>
              <div class="sm:w-48">
                <label for="relationship-type" class="text-sm font-medium">Relationship</label>
                <Select v-model="relationshipType">
                  <SelectTrigger id="relationship-type" class="mt-1.5 h-11 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="additional_client">Additional client</SelectItem><SelectItem value="primary_client">Primary client</SelectItem></SelectContent>
                </Select>
              </div>
              <Button class="min-h-11 gap-1.5" :disabled="!selectedCase || store.saving" :loading="store.saving" @click="attachCase"><LinkIcon class="size-4" /> Link case</Button>
            </div>
            <p v-if="relationshipError" class="mt-2 text-sm text-destructive" role="alert">{{ relationshipError }}</p>
          </div>
          <div v-if="client.linked_cases?.length" class="mt-4 space-y-2">
            <NuxtLink v-for="link in client.linked_cases" :key="link.case_id" :to="`/cases/${link.case_id}`" class="block rounded-lg border p-3 hover:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
               <div class="flex items-center justify-between gap-3">
                 <p class="text-sm font-medium">{{ link.case?.title || 'Linked case' }}</p>
                 <div class="flex items-center gap-2"><span class="rounded-full bg-muted px-2 py-1 text-xs">{{ link.relationship_label }}</span><Button v-if="!client.archived_at && client.capabilities?.update !== false" variant="ghost" size="icon" class="size-10" :disabled="store.saving" :aria-label="`Remove ${link.case?.title || 'case'} link`" @click.prevent="detachCase(link.case_id)"><XIcon class="size-4" /></Button></div>
              </div>
              <p class="mt-1 text-xs text-muted-foreground">{{ link.case?.reference || link.case_id }}<span v-if="link.case?.status"> · {{ link.case.status }}</span></p>
            </NuxtLink>
          </div>
          <div v-else class="mt-4 rounded-lg border border-dashed p-6 text-center">
            <p class="text-sm text-muted-foreground">No confirmed client links yet.</p>
            <p class="mt-1 text-xs text-muted-foreground">Legacy related parties are not converted automatically.</p>
          </div>
        </section>
      </div>
    </template>

    <CrmClientForm v-if="showForm && client" :client="client" :busy="actionBusy" @submit="save" @cancel="showForm = false" />

    <div v-if="showReplacementDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
      <section role="alertdialog" aria-modal="true" aria-labelledby="replacement-title" class="w-full max-w-md rounded-2xl bg-card p-6 shadow-float">
        <h2 id="replacement-title" class="text-lg font-semibold">Choose a replacement primary client</h2>
        <p class="mt-2 text-sm leading-relaxed text-muted-foreground">This case has other linked clients. Choose which linked client should become primary before removing this client.</p>
        <SearchableSelect id="replacement-client" v-model="replacementClientId" :options="replacementOptions" placeholder="Select a replacement…" search-placeholder="Search linked clients…" empty-label="No eligible linked clients found." class="mt-4" />
        <p v-if="relationshipError" class="mt-2 text-sm text-destructive" role="alert">{{ relationshipError }}</p>
        <div class="mt-6 flex justify-end gap-2">
          <Button variant="outline" class="min-h-11" :disabled="store.saving" @click="showReplacementDialog = false">Cancel</Button>
          <Button class="min-h-11" :disabled="!replacementClientId" :loading="store.saving" @click="confirmReplacement">Remove link</Button>
        </div>
      </section>
    </div>

    <div v-if="confirmArchive" class="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
      <section role="alertdialog" aria-modal="true" aria-labelledby="archive-title" class="w-full max-w-md rounded-2xl bg-card p-6 shadow-float">
        <h2 id="archive-title" class="text-lg font-semibold">Archive client?</h2>
        <p class="mt-2 text-sm leading-relaxed text-muted-foreground">This hides the client from active views. Linked cases, documents, conversations, tasks, links, and audit history are preserved.</p>
        <div class="mt-6 flex justify-end gap-2">
          <Button variant="outline" class="min-h-11" :disabled="actionBusy" @click="confirmArchive = false">Cancel</Button>
          <Button variant="destructive" class="min-h-11" :loading="actionBusy" @click="archive">Archive client</Button>
        </div>
      </section>
    </div>
  </main>
</template>
