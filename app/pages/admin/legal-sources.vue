<script setup lang="ts">
import { toast } from 'vue-sonner'
import { PlusIcon, TrashIcon, RefreshCwIcon } from '@lucide/vue'

definePageMeta({
  middleware: 'admin',
})

interface LegalSource {
  id: string
  name: string
  base_domain: string
  seed_urls: string[]
  is_active: boolean
  crawled_pages_count: number
  legal_chunks_count: number
  created_at: string
  updated_at: string
}

const api = useApi()

const sources = ref<LegalSource[]>([])
const loading = ref(false)

const showForm = ref(false)
const creating = ref(false)
const formError = ref('')
const form = reactive({
  name: '',
  base_domain: '',
  seed_urls: '',
  is_active: true,
})

async function loadSources() {
  loading.value = true
  try {
    sources.value = await api<LegalSource[]>('/admin/legal-sources')
  } catch {
    sources.value = []
  } finally {
    loading.value = false
  }
}

async function createSource() {
  formError.value = ''

  const seedUrls = form.seed_urls
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (!form.name.trim() || !form.base_domain.trim()) {
    formError.value = 'Name and base domain are required.'
    return
  }

  if (seedUrls.length === 0) {
    formError.value = 'At least one seed URL is required.'
    return
  }

  creating.value = true
  try {
    await api('/admin/legal-sources', {
      method: 'POST',
      body: {
        name: form.name.trim(),
        base_domain: form.base_domain.trim(),
        seed_urls: seedUrls,
        is_active: form.is_active,
      },
    })
    toast.success('Legal source added')
    Object.assign(form, { name: '', base_domain: '', seed_urls: '', is_active: true })
    showForm.value = false
    await loadSources()
  } catch (err: any) {
    formError.value = err?.data?.message ?? 'Could not create the legal source.'
  } finally {
    creating.value = false
  }
}

async function crawl(source: LegalSource) {
  try {
    const { message } = await api<{ message: string }>(`/admin/legal-sources/${source.id}/crawl-now`, {
      method: 'POST',
    })
    toast.success(message)
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not start the crawl')
  }
}

async function removeSource(source: LegalSource) {
  try {
    await api(`/admin/legal-sources/${source.id}`, { method: 'DELETE' })
    toast.success(`Deleted ${source.name}`)
    await loadSources()
  } catch {
    toast.error('Could not delete the legal source')
  }
}

onMounted(loadSources)
</script>

<template>
  <div class="mx-auto w-full max-w-5xl px-4 py-8">
    <div class="mb-6">
      <h1 class="text-xl font-semibold">Admin</h1>
      <nav class="mt-2 flex items-center gap-1 text-sm">
        <NuxtLink to="/admin/legal-sources" class="rounded-md bg-muted px-3 py-1.5 font-medium">
          Legal sources
        </NuxtLink>
        <NuxtLink to="/admin/crawled-pages" class="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted">
          Crawled pages
        </NuxtLink>
        <NuxtLink to="/admin/system-prompts" class="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted">
          System prompts
        </NuxtLink>
      </nav>
    </div>

    <div class="mb-4 flex items-center justify-between">
      <p class="text-sm text-muted-foreground">
        {{ sources.length }} allowlisted source{{ sources.length === 1 ? '' : 's' }}
      </p>
      <Button @click="showForm = !showForm">
        <PlusIcon class="size-4" />
        Add source
      </Button>
    </div>

    <Card v-if="showForm" class="mb-6">
      <CardHeader>
        <CardTitle class="text-base">Add a legal source</CardTitle>
        <CardDescription>
          The crawler will follow pages within the base domain and index legal texts for retrieval.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" @submit.prevent="createSource">
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-2">
              <Label for="name">Name</Label>
              <Input id="name" v-model="form.name" placeholder="Supreme Court E-Library" required />
            </div>
            <div class="space-y-2">
              <Label for="base_domain">Base domain</Label>
              <Input id="base_domain" v-model="form.base_domain" placeholder="elibrary.judiciary.gov.ph" required />
            </div>
          </div>
          <div class="space-y-2">
            <Label for="seed_urls">Seed URLs (one per line)</Label>
            <Textarea
              id="seed_urls"
              v-model="form.seed_urls"
              rows="3"
              placeholder="https://lawphil.net/statutes/repacts/repacts.html"
              required
            />
          </div>

          <div class="flex items-center gap-2">
            <Switch id="is_active" v-model:checked="form.is_active" />
            <Label for="is_active">Active</Label>
          </div>

          <p v-if="formError" class="text-sm text-destructive">{{ formError }}</p>

          <div class="flex justify-end gap-2">
            <Button type="button" variant="outline" @click="showForm = false">Cancel</Button>
            <Button type="submit" :disabled="creating">
              {{ creating ? 'Adding…' : 'Add source' }}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>

    <div class="space-y-2">
      <div v-if="loading" class="space-y-2">
        <Skeleton v-for="i in 3" :key="i" class="h-20 w-full" />
      </div>

      <div v-else-if="sources.length === 0" class="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        No legal sources configured.
      </div>

      <Card v-for="source in sources" :key="source.id">
        <CardContent class="p-4">
          <div class="flex flex-wrap items-center gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <p class="truncate text-sm font-medium">{{ source.name }}</p>
                <Badge variant="outline" :class="source.is_active ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'">
                  {{ source.is_active ? 'Active' : 'Inactive' }}
                </Badge>
              </div>
              <p class="mt-0.5 truncate text-xs text-muted-foreground">{{ source.base_domain }}</p>
              <p class="mt-1 text-xs text-muted-foreground">
                {{ source.crawled_pages_count }} pages · {{ source.legal_chunks_count }} indexed chunks
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <Button variant="outline" size="sm" @click="crawl(source)">
                <RefreshCwIcon class="size-3.5" />
                Crawl now
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="text-muted-foreground hover:text-destructive"
                @click="removeSource(source)"
              >
                <TrashIcon class="size-4" />
                <span class="sr-only">Delete {{ source.name }}</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
