<script setup lang="ts">
import { toast } from '~/components/ui/sonner'
import {
  FileTextIcon,
  Loader2Icon,
  PlusIcon,
  ScaleIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from '@lucide/vue'

definePageMeta({
  middleware: ['auth', 'organization', 'subscription'],
})

interface Template {
  id: string
  name: string
  category: 'formal' | 'basic' | 'legal' | 'custom'
  jurisdiction: string
  legal_subtype: string | null
  structure: string[]
  placeholder_fields: Array<{ key: string; label: string; required: boolean }> | string[]
  is_system: boolean
  content: string | null
  created_at: string
}

const api = useApi()

const templates = ref<Template[]>([])
const loading = ref(false)

const showForm = ref(false)
const creating = ref(false)
const formError = ref('')
const form = reactive({
  name: '',
  content: '',
})
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const fileError = ref('')

const ownTemplates = computed(() => templates.value.filter((t) => !t.is_system))
const systemTemplates = computed(() => templates.value.filter((t) => t.is_system))

const CATEGORY_LABELS: Record<Template['category'], string> = {
  legal: 'Legal (Philippine)',
  formal: 'Formal',
  basic: 'Basic',
  custom: 'Custom',
}

const CATEGORY_ORDER: Template['category'][] = ['legal', 'formal', 'basic', 'custom']

const groupedSystem = computed(() => {
  const map: Record<string, Template[]> = {}
  for (const template of systemTemplates.value) {
    const list = map[template.category] ?? []
    list.push(template)
    map[template.category] = list
  }
  const ordered: Array<{ category: Template['category']; templates: Template[] }> = []
  for (const category of CATEGORY_ORDER) {
    if (map[category]?.length) {
      ordered.push({ category, templates: map[category] })
    }
  }
  return ordered
})

function humanizeSubtype(subtype: string | null) {
  if (!subtype) return ''
  return subtype.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

async function loadTemplates() {
  loading.value = true
  try {
    const { data } = await api<{ data: Template[] }>('/templates')
    templates.value = data
  } catch {
    templates.value = []
  } finally {
    loading.value = false
  }
}

const TEXT_EXTENSIONS = ['.txt', '.md', '.markdown']

const selectedFileExt = computed(() => {
  if (!selectedFile.value) return ''
  const dot = selectedFile.value.name.lastIndexOf('.')
  return dot >= 0 ? selectedFile.value.name.slice(dot).toLowerCase() : ''
})

const binaryFile = computed(() => selectedFileExt.value === '.pdf' || selectedFileExt.value === '.docx')

async function handleFile(file: File) {
  fileError.value = ''

  const dot = file.name.lastIndexOf('.')
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : ''
  if (![...TEXT_EXTENSIONS, '.pdf', '.docx'].includes(ext)) {
    fileError.value = 'Supported files: PDF, DOCX, TXT, MD.'
    return
  }

  selectedFile.value = file

  if (!form.name.trim()) {
    form.name = file.name.replace(/\.[^.]+$/, '')
  }

  if (TEXT_EXTENSIONS.includes(ext)) {
    try {
      form.content = await file.text()
    } catch {
      fileError.value = `Could not read "${file.name}".`
    }
  } else {
    form.content = ''
  }
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  await handleFile(file)
}

const fileDrop = useFileDrop(['.pdf', '.docx', '.txt', '.md', '.markdown'])

function onFilesDropped(event: DragEvent) {
  const rejected = fileDrop.onDrop(event, (files) => {
    void handleFile(files[0])
  })

  if (rejected.length > 0) {
    fileError.value = `"${rejected[0].name}" is not a supported file type. Use PDF, DOCX, TXT, or MD.`
  }
}

async function createTemplate() {
  formError.value = ''

  if (!form.name.trim()) {
    formError.value = 'Template name is required.'
    return
  }
  if (!form.content.trim() && !selectedFile.value) {
    formError.value = 'Template content is required — paste it or drop a file (PDF, DOCX, TXT, MD).'
    return
  }

  creating.value = true
  try {
    if (selectedFile.value) {
      const formData = new FormData()
      formData.append('name', form.name.trim())
      formData.append('category', 'custom')
      formData.append('template_file', selectedFile.value)
      await api('/templates', { method: 'POST', body: formData })
    } else {
      await api('/templates', {
        method: 'POST',
        body: { name: form.name.trim(), category: 'custom', content: form.content },
      })
    }
    toast.success('Template saved')
    form.name = ''
    form.content = ''
    selectedFile.value = null
    fileError.value = ''
    showForm.value = false
    await loadTemplates()
  } catch (err: any) {
    formError.value = err?.data?.message ?? 'Could not save the template.'
  } finally {
    creating.value = false
  }
}

async function deleteTemplate(template: Template) {
  try {
    await api(`/templates/${template.id}`, { method: 'DELETE' })
    toast.success(`Deleted "${template.name}"`)
    await loadTemplates()
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not delete the template')
  }
}

onMounted(loadTemplates)
</script>

<template>
  <div class="mx-auto w-full max-w-4xl px-4 py-8">
    <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">Templates</h1>
        <p class="mt-0.5 text-sm text-muted-foreground">
          Upload your own letter templates, then pick them from "Draft a letter" to guide a draft.
        </p>
      </div>
      <Button @click="showForm = !showForm">
        <PlusIcon v-if="!showForm" class="size-4" />
        <XIcon v-else class="size-4" />
        {{ showForm ? 'Cancel' : 'Upload template' }}
      </Button>
    </div>

    <Card v-if="showForm" class="mb-6">
      <CardHeader>
        <CardTitle class="text-base">Upload a template</CardTitle>
        <CardDescription class="text-xs">
          Paste the template text or drop a file (PDF, DOCX, TXT, MD). Batayan will extract the text and treat it as
          the structure and conventions to follow when drafting a letter.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" @submit.prevent="createTemplate">
          <div class="space-y-2">
            <Label for="template-name">Name</Label>
            <Input id="template-name" v-model="form.name" placeholder="e.g. My Demand Letter" required />
          </div>

          <div class="space-y-2">
            <Label for="template-content">Content</Label>
            <Textarea
              id="template-content"
              v-model="form.content"
              rows="12"
              :placeholder="binaryFile
                ? 'Text will be read from the uploaded file.'
                : 'REPUBLIC OF THE PHILIPPINES\n_______________________\n\u2026\n\nPlease draft this letter\u2026'"
              class="font-mono text-xs"
              :required="!selectedFile"
              :disabled="binaryFile"
            />
          </div>

          <div>
            <div
              class="flex items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center text-xs text-muted-foreground transition-colors"
              :class="fileDrop.dragging.value ? 'border-primary bg-primary/5' : ''"
              @click="fileInput?.click()"
              @keydown.enter="fileInput?.click()"
              @dragenter="fileDrop.onDragEnter"
              @dragover="fileDrop.onDragOver"
              @dragleave="fileDrop.onDragLeave"
              @drop="onFilesDropped"
              role="button"
              tabindex="0"
            >
              <UploadIcon class="size-4" />
              <span v-if="selectedFile">{{ selectedFile.name }}</span>
              <span v-else>Drop a PDF, DOCX, TXT, or MD file here, or click to choose one</span>
            </div>
            <input
              ref="fileInput"
              type="file"
              accept=".pdf,.docx,.txt,.md,.markdown"
              class="hidden"
              @change="onFileSelected"
            />
            <p v-if="selectedFile" class="mt-1 text-[11px] text-muted-foreground">
              PDF and DOCX text is extracted on upload. TXT and MD preview below.
            </p>
            <p v-if="fileError" class="mt-1 text-xs text-destructive">{{ fileError }}</p>
          </div>

          <p v-if="formError" class="text-sm text-destructive">{{ formError }}</p>

          <div class="flex justify-end gap-2">
            <Button type="button" variant="outline" @click="showForm = false">Cancel</Button>
            <Button type="submit" :disabled="creating">
              <Loader2Icon v-if="creating" class="size-4 animate-spin" />
              {{ creating ? 'Saving…' : 'Save template' }}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>

    <section class="mb-8">
      <h2 class="mb-2 text-sm font-medium text-muted-foreground">Your templates</h2>

      <div v-if="loading && ownTemplates.length === 0" class="space-y-2">
        <Skeleton v-for="i in 2" :key="i" class="h-20 w-full rounded-xl" />
      </div>

      <div
        v-else-if="ownTemplates.length === 0"
        class="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground"
      >
        No custom templates yet. Upload your own above to use them when drafting a letter.
      </div>

      <div v-else class="space-y-2">
        <Card v-for="template in ownTemplates" :key="template.id">
          <CardContent class="p-4">
            <div class="flex items-start gap-3">
              <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <FileTextIcon class="size-4 text-primary" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <p class="text-sm font-medium">{{ template.name }}</p>
                  <Badge variant="secondary" class="text-[10px]">Yours</Badge>
                </div>
                <pre class="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">{{ template.content }}</pre>
                <p class="mt-1.5 text-xs text-muted-foreground">
                  {{ CATEGORY_LABELS[template.category] }} · Created {{ formatDate(template.created_at) }}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                class="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Delete template"
                @click="deleteTemplate(template)"
              >
                <TrashIcon class="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>

    <section>
      <h2 class="mb-2 text-sm font-medium text-muted-foreground">System templates</h2>

      <div v-if="loading && systemTemplates.length === 0" class="space-y-2">
        <Skeleton v-for="i in 2" :key="i" class="h-20 w-full rounded-xl" />
      </div>

      <div v-else-if="systemTemplates.length === 0" class="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        No system templates yet.
      </div>

      <div v-else class="space-y-2">
        <Card v-for="group in groupedSystem" :key="group.category">
          <CardContent class="p-4">
            <p class="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <ScaleIcon v-if="group.category === 'legal'" class="size-3.5 text-primary" />
              {{ CATEGORY_LABELS[group.category] }}
            </p>
            <div class="space-y-1">
              <button
                v-for="template in group.templates"
                :key="template.id"
                type="button"
                class="flex w-full items-center justify-between gap-2 rounded-lg border p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <div class="min-w-0">
                  <p class="text-sm font-medium">{{ template.name }}</p>
                  <p v-if="template.legal_subtype" class="mt-0.5 text-[11px] text-muted-foreground">
                    {{ humanizeSubtype(template.legal_subtype) }}
                  </p>
                </div>
                <Badge v-if="group.category === 'legal'" variant="secondary" class="shrink-0 text-[10px]">
                  PH
                </Badge>
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  </div>
</template>
