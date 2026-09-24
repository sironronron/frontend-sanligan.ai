<script setup lang="ts">
import { InboxIcon, PlusIcon, Settings2Icon } from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import type { PipelineItem } from '~/types/pipeline'

definePageMeta({ middleware: ['auth', 'onboarding', 'subscription', 'terms'] })

const store = usePipelineStore()
const clientStore = useClientStore()
const selectedId = ref('')
const showForm = ref(false)
const editItem = ref<PipelineItem | null>(null)
const history = ref<PipelineItem | null>(null)
const historyRows = ref<Awaited<ReturnType<typeof store.fetchHistory>>>([])
const historyLoading = ref(false)
const firstUse = ref(false)
const firstUseTemplate = ref<string | undefined>()
const provisionError = ref<unknown>(null)
const offline = ref(false)
const announcement = ref('')
const access = ref<'loading' | 'ready' | 'error' | 'unauthorized' | 'forbidden'>('loading')
const pipeline = computed(() => store.pipelines.find(p => p.id === selectedId.value) ?? store.pipelines[0] ?? null)
const pipelineOptions = computed(() => store.pipelines.map(candidate => ({ value: candidate.id, label: candidate.name })))

function statusOf(error: unknown) {
  return store.statusOf(error)
}

function setOffline() {
  offline.value = !navigator.onLine
}

async function load() {
  try {
    await store.fetchPipelines()
    if (!store.pipelines.length) {
      firstUse.value = true
      await store.fetchTemplates()
      access.value = 'ready'
      return
    }
    if (!selectedId.value && store.pipelines[0]) selectedId.value = store.pipelines[0].id
    if (pipeline.value) await store.fetchItems(pipeline.value.id)
    access.value = 'ready'
  } catch (error) {
    const status = statusOf(error)
    access.value = status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : 'error'
    offline.value = !status
  }
}

async function provision() {
  provisionError.value = null
  try {
    const result = await store.provisionPipeline(firstUseTemplate.value)
    firstUse.value = false
    selectedId.value = result.pipeline.id
    await store.fetchPipelines()
    announcement.value = result.replay ? 'This intake pipeline was already set up. No duplicate was created.' : 'Your intake pipeline is configured.'
    await store.fetchItems(result.pipeline.id)
  } catch (error) {
    provisionError.value = error
    if (statusOf(error) === 422) await store.fetchTemplates().catch(() => undefined)
  }
}

watch(selectedId, async id => {
  if (id) {
    try {
      await store.fetchItems(id)
    } catch (error) {
      toast.error('Items could not load. Retry when your connection is back.')
      offline.value = !statusOf(error)
    }
  }
})

onMounted(async () => {
  setOffline()
  window.addEventListener('offline', setOffline)
  window.addEventListener('online', setOffline)
  try {
    await clientStore.fetchClients({ per_page: 100 })
  } catch {
    /* board remains usable if client picker is unavailable */
  }
  await load()
})

onBeforeUnmount(() => {
  window.removeEventListener('offline', setOffline)
  window.removeEventListener('online', setOffline)
})

async function submitItem(payload: Parameters<typeof store.createItem>[0]) {
  try {
    await (editItem.value ? store.updateItem(editItem.value.id, payload) : store.createItem(payload))
    showForm.value = false
    editItem.value = null
    await store.fetchItems(pipeline.value!.id)
    toast.success('Intake item saved.')
    announcement.value = 'Intake item saved.'
  } catch (error) {
    toast.error((error as { data?: { message?: string } })?.data?.message ?? 'Could not save. Your draft is still here.')
  }
}

async function move(item: PipelineItem, stageId: string) {
  try {
    await store.moveItem(item, stageId)
    await store.fetchItems(pipeline.value!.id)
    const name = pipeline.value!.stages.find(s => s.id === stageId)?.name ?? 'the new stage'
    announcement.value = `${item.title} moved to ${name}.`
    toast.success(`Moved to ${name}.`)
  } catch (error) {
    await store.fetchItems(pipeline.value!.id)
    toast.error(statusOf(error) === 409 ? 'This intake item changed. The board was refreshed; review it and retry.' : 'Could not move the item. No changes were made.')
  }
}

async function openHistory(item: PipelineItem) {
  history.value = item
  historyLoading.value = true
  try {
    historyRows.value = await store.fetchHistory(item.id)
  } catch {
    historyRows.value = []
    toast.error('History could not load. Retry later.')
  } finally {
    historyLoading.value = false
  }
}
</script>

<template>
  <main class="mx-auto w-full max-w-7xl px-4 pt-8 pb-6 sm:px-6">
    <AppPageHeader title="Intake" description="Track client intake progress without changing legal-case status." :icon="InboxIcon">
      <template #breadcrumb>CRM</template>
      <template #actions>
        <NuxtLink to="/crm/pipelines" class="inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted"><Settings2Icon class="size-4" /> Pipeline settings</NuxtLink>
        <Button class="min-h-11 gap-1.5 border-0 bg-brand-gradient text-primary-foreground" :disabled="!pipeline || offline || store.saving" @click="editItem = null; showForm = true"><PlusIcon class="size-4" /> New intake</Button>
      </template>
    </AppPageHeader>

    <div v-if="offline" class="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm" role="status">You are offline. Changes are disabled until the connection returns.</div>
    <div v-if="access === 'loading' || store.loading" aria-busy="true" class="mt-5 grid gap-3 lg:grid-cols-3">
      <Skeleton v-for="i in 3" :key="i" class="h-64 rounded-xl" />
    </div>
    <div v-else-if="access === 'unauthorized'" class="surface-inset mt-5 py-16 text-center">
      <h2 class="text-lg font-semibold">Your session has ended</h2>
      <p class="mt-2 text-sm text-muted-foreground">Sign in again to view intake pipelines.</p>
      <Button class="mt-5 min-h-11" @click="navigateTo('/login')">Sign in</Button>
    </div>
    <div v-else-if="access === 'forbidden'" class="surface-inset mt-5 py-16 text-center">
      <h2 class="text-lg font-semibold">CRM access unavailable</h2>
      <p class="mt-2 text-sm text-muted-foreground">You do not have permission to view this workspace.</p>
    </div>
    <div v-else-if="access === 'error'" class="surface-inset mt-5 py-16 text-center">
      <h2 class="text-lg font-semibold">Pipelines could not load</h2>
      <Button variant="outline" class="mt-5 min-h-11" @click="load">Retry</Button>
    </div>
     <template v-else-if="firstUse">
       <PipelineTemplatePicker :templates="store.templates" :loading="store.templatesLoading" :error="store.templatesError || provisionError" :forbidden="access === 'forbidden'" :busy="store.saving" submit-label="Set up intake" @select="firstUseTemplate = $event" @retry="load" @confirm="provision" />
       <p class="mt-3 text-center text-sm text-muted-foreground">You can leave this screen and create a pipeline explicitly from Pipeline settings.</p>
     </template>
     <template v-else-if="!store.pipelines.length">
      <EmptyState :icon="InboxIcon" title="No intake pipeline yet" description="Create a pipeline and add stages to start tracking intake progress." />
      <div class="mt-4 text-center"><NuxtLink to="/crm/pipelines" class="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Create pipeline</NuxtLink></div>
    </template>
    <template v-else-if="pipeline">
      <div class="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label for="pipeline-select" class="text-sm font-medium">Pipeline</label>
        <SearchableSelect
          id="pipeline-select"
          v-model="selectedId"
          :options="pipelineOptions"
          placeholder="Choose a pipeline…"
          search-placeholder="Search pipelines…"
          empty-label="No pipelines match your search."
          class="w-full sm:w-64"
        />
      </div>
      <PipelineBoard :pipeline="pipeline" :items="store.items" :loading="store.itemsLoading" :busy="store.saving || offline" :error="store.itemsError" :announcement="announcement" @retry="load" @edit="editItem = $event; showForm = true" @move="move" @history="openHistory" />
      <PipelineItemForm v-if="showForm" :pipeline="pipeline" :clients="clientStore.clients" :item="editItem" :busy="store.saving" :offline="offline" @submit="submitItem" @cancel="showForm = false; editItem = null" />
      <div v-if="history" class="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 sm:items-center sm:p-4">
        <section role="dialog" aria-modal="true" aria-labelledby="history-title" class="w-full rounded-t-2xl bg-card p-5 sm:max-w-lg sm:rounded-2xl">
          <div class="flex items-center justify-between gap-3">
            <h2 id="history-title" class="text-lg font-semibold">History · {{ history.title }}</h2>
            <Button variant="ghost" class="min-h-10" @click="history = null">Close</Button>
          </div>
          <div v-if="historyLoading" class="mt-4 space-y-2" aria-busy="true">
            <Skeleton class="h-10" />
            <Skeleton class="h-10" />
          </div>
          <p v-else-if="!historyRows.length" class="mt-5 text-sm text-muted-foreground">No stage transitions recorded yet.</p>
          <ol v-else class="mt-5 grid gap-3">
            <li v-for="entry in historyRows" :key="entry.id" class="rounded-lg border p-3 text-sm">
              <p>{{ entry.previous_stage?.name ?? 'Created' }} → {{ entry.new_stage?.name ?? 'Unknown stage' }}</p>
              <p class="mt-1 text-xs text-muted-foreground">{{ entry.actor?.name ?? 'Practice member' }} · {{ new Date(entry.created_at).toLocaleString() }}</p>
            </li>
          </ol>
        </section>
      </div>
    </template>
  </main>
</template>
