<script setup lang="ts">
import { toast } from '~/components/ui/sonner'
import { PlusIcon, CheckIcon } from '@lucide/vue'

definePageMeta({
  middleware: 'admin',
})

interface SystemPrompt {
  id: string
  name: string
  version: number
  content: string
  is_active: boolean
  created_at: string
  updated_at: string
}

const api = useApi()

const prompts = ref<SystemPrompt[]>([])
const loading = ref(false)

const showForm = ref(false)
const creating = ref(false)
const formError = ref('')
const form = reactive({
  name: 'saligan',
  content: '',
})

const grouped = computed(() => {
  const names = [...new Set(prompts.value.map((p) => p.name))]
  return names.map((name) => ({
    name,
    versions: prompts.value
      .filter((p) => p.name === name)
      .sort((a, b) => b.version - a.version),
  }))
})

const activePrompt = computed(() => prompts.value.find((p) => p.is_active) ?? null)

async function loadPrompts() {
  loading.value = true
  try {
    const { data } = await api<{ data: SystemPrompt[] }>('/admin/system-prompts')
    prompts.value = data
  } catch {
    prompts.value = []
  } finally {
    loading.value = false
  }
}

async function createPrompt() {
  formError.value = ''

  if (!form.content.trim()) {
    formError.value = 'Prompt content is required.'
    return
  }

  creating.value = true
  try {
    await api('/admin/system-prompts', {
      method: 'POST',
      body: { name: form.name.trim(), content: form.content },
    })
    toast.success('Prompt version created')
    form.content = ''
    showForm.value = false
    await loadPrompts()
  } catch (err: any) {
    formError.value = err?.data?.message ?? 'Could not create the prompt.'
  } finally {
    creating.value = false
  }
}

async function activate(prompt: SystemPrompt) {
  try {
    await api(`/admin/system-prompts/${prompt.id}/activate`, { method: 'POST' })
    toast.success(`Activated ${prompt.name} v${prompt.version}`)
    await loadPrompts()
  } catch {
    toast.error('Could not activate the prompt')
  }
}

onMounted(loadPrompts)
</script>

<template>
  <div class="mx-auto w-full max-w-4xl px-4 py-8">
    <div class="mb-6">
      <h1 class="text-xl font-semibold">Admin</h1>
      <nav class="mt-2 flex items-center gap-1 text-sm">
        <NuxtLink to="/admin/legal-sources" class="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted">
          Legal sources
        </NuxtLink>
        <NuxtLink to="/admin/crawled-pages" class="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted">
          Crawled pages
        </NuxtLink>
        <NuxtLink to="/admin/system-prompts" class="rounded-md bg-muted px-3 py-1.5 font-medium">
          System prompts
        </NuxtLink>
      </nav>
    </div>

    <div class="mb-6 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
      <span class="font-medium">Active prompt:</span>
      <span v-if="activePrompt">
        {{ activePrompt.name }} v{{ activePrompt.version }} · {{ activePrompt.name === 'saligan' ? 'Batayan assistant' : '' }}
      </span>
      <span v-else class="text-muted-foreground">none — chat is disabled until one is activated</span>
    </div>

    <div class="mb-4 flex items-center justify-between">
      <p class="text-sm text-muted-foreground">New versions are saved inactive until you activate them.</p>
      <Button @click="showForm = !showForm">
        <PlusIcon class="size-4" />
        New version
      </Button>
    </div>

    <Card v-if="showForm" class="mb-6">
      <CardHeader>
        <CardTitle class="text-base">Create a system prompt version</CardTitle>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" @submit.prevent="createPrompt">
          <div class="space-y-2">
            <Label for="name">Name</Label>
            <Input id="name" v-model="form.name" placeholder="saligan" required />
          </div>
          <div class="space-y-2">
            <Label for="content">Content</Label>
            <Textarea
              id="content"
              v-model="form.content"
              rows="10"
              placeholder="You are Batayan, a legal research assistant…"
              required
            />
          </div>

          <p v-if="formError" class="text-sm text-destructive">{{ formError }}</p>

          <div class="flex justify-end gap-2">
            <Button type="button" variant="outline" @click="showForm = false">Cancel</Button>
            <Button type="submit" :disabled="creating">
              {{ creating ? 'Creating…' : 'Create version' }}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>

    <div class="space-y-6">
      <div v-if="loading" class="space-y-2">
        <Skeleton v-for="i in 2" :key="i" class="h-32 w-full" />
      </div>

      <div v-else-if="prompts.length === 0" class="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        No system prompts yet.
      </div>

      <section v-for="group in grouped" :key="group.name">
        <h2 class="mb-2 text-sm font-medium text-muted-foreground">{{ group.name }}</h2>
        <div class="space-y-2">
          <Card v-for="prompt in group.versions" :key="prompt.id">
            <CardContent class="p-4">
              <div class="flex items-start gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <p class="text-sm font-medium">
                      {{ prompt.name }} <span class="text-muted-foreground">v{{ prompt.version }}</span>
                    </p>
                    <Badge
                      v-if="prompt.is_active"
                      class="bg-forest/10 text-forest dark:bg-cream/10 dark:text-peach"
                    >
                      Active
                    </Badge>
                  </div>
                  <pre class="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">{{ prompt.content }}</pre>
                  <p class="mt-1.5 text-xs text-muted-foreground">
                    Created {{ new Date(prompt.created_at).toLocaleString() }}
                  </p>
                </div>
                <Button
                  v-if="!prompt.is_active"
                  variant="outline"
                  size="sm"
                  class="shrink-0"
                  @click="activate(prompt)"
                >
                  <CheckIcon class="size-3.5" />
                  Activate
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  </div>
</template>
