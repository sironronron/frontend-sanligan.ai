<script setup lang="ts">
import {
  DownloadIcon,
  FileTextIcon,
  Loader2Icon,
  XIcon,
} from '@lucide/vue'
import { useDocumentExport } from '~/composables/useDocumentExport'

definePageMeta({
  middleware: ['auth', 'organization', 'subscription'],
})

interface GeneratedDocument {
  id: string
  conversation_id: string
  conversation_title: string | null
  title: string
  content: string
  created_at: string
}

const api = useApi()

const documents = ref<GeneratedDocument[]>([])
const loading = ref(false)
const { previewDoc, openExport, closePreview } = useDocumentExport()

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function download(doc: GeneratedDocument, type: 'word' | 'pdf') {
  void openExport(doc.content, type, doc.title)
}

async function loadDocuments() {
  loading.value = true
  try {
    const { data } = await api<{ data: GeneratedDocument[] }>('/generated-documents')
    documents.value = data
  } catch {
    // keep the current list on transient errors
  } finally {
    loading.value = false
  }
}

onMounted(loadDocuments)
</script>

<template>
  <div class="mx-auto w-full max-w-4xl px-4 py-8">
    <PageHeader
      title="Generated documents"
      description="Revisit the letters, pleadings, and forms the assistant drafted for you, and download them again."
    />

    <ListSkeleton v-if="loading" :rows="3" />

    <EmptyState
      v-else-if="documents.length === 0"
      :icon="FileTextIcon"
      title="No generated documents yet"
      description="Ask the assistant to draft a letter or pleading, then export it from the chat."
    >
      <Button @click="navigateTo('/chat')">Start a draft</Button>
    </EmptyState>

    <div v-else class="space-y-2">
      <h2 class="text-sm font-medium text-muted-foreground">
        {{ documents.length }} document{{ documents.length === 1 ? '' : 's' }}
      </h2>

      <div v-for="doc in documents" :key="doc.id" class="rounded-xl border bg-card">
        <div class="flex items-center gap-3 p-4">
          <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <FileTextIcon class="size-4 text-primary" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{{ doc.title }}</p>
            <p class="mt-0.5 truncate text-xs text-muted-foreground">
              <NuxtLink
                v-if="doc.conversation_id"
                :to="`/chat?c=${doc.conversation_id}`"
                class="font-medium text-primary hover:underline"
              >
                {{ doc.conversation_title ?? 'Open conversation' }}
              </NuxtLink>
              <span v-else>Conversation</span>
              <span> · {{ formatDate(doc.created_at) }}</span>
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" class="h-7 gap-1.5 px-2.5 text-xs" @click="download(doc, 'word')">
              <DownloadIcon class="size-3.5" />
              Word
            </Button>
            <Button variant="outline" size="sm" class="h-7 gap-1.5 px-2.5 text-xs" @click="download(doc, 'pdf')">
              <DownloadIcon class="size-3.5" />
              PDF
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- Document Preview Panel (Large Screens) -->
    <aside
      v-if="previewDoc"
      class="fixed inset-y-0 right-0 z-40 hidden w-[28rem] max-w-[calc(100vw-2rem)] flex-col border-l bg-background shadow-2xl lg:flex"
    >
      <div class="flex items-center justify-between border-b px-4 py-2.5">
        <span class="truncate text-sm font-medium">{{ previewDoc.title }}</span>
        <div class="flex items-center gap-2">
          <a
            v-if="previewDoc.blobUrl"
            :href="previewDoc.blobUrl"
            target="_blank"
            download
            class="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <DownloadIcon class="size-3.5" />
            Download
          </a>
          <Button variant="ghost" size="icon" class="size-7" @click="closePreview">
            <XIcon class="size-4" />
          </Button>
        </div>
      </div>
      <div v-if="previewDoc.loading" class="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon class="size-4 animate-spin" />
        Preparing your document…
      </div>
      <div v-else-if="previewDoc.error" class="flex flex-1 items-center justify-center px-6 text-center text-sm text-destructive">
        {{ previewDoc.error }}
      </div>
      <iframe
        v-else-if="previewDoc.type === 'pdf'"
        :src="previewDoc.blobUrl ?? undefined"
        class="w-full flex-1 border-0"
      />
      <div v-else class="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
        <span>Word documents cannot be previewed inline.</span>
        <a
          :href="previewDoc.blobUrl ?? undefined"
          download
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <DownloadIcon class="size-3.5" />
          Download Word document
        </a>
      </div>
    </aside>

    <!-- Mobile Preview Modal -->
    <Teleport to="body">
      <div v-if="previewDoc" class="fixed inset-0 z-50 lg:hidden">
        <div class="absolute inset-0 bg-black/60" @click="closePreview" />
        <div class="absolute inset-4 flex flex-col rounded-lg bg-background shadow-xl">
          <div class="flex items-center justify-between border-b px-4 py-2.5">
            <span class="truncate text-sm font-medium">{{ previewDoc.title }}</span>
            <div class="flex items-center gap-2">
              <a
                v-if="previewDoc.blobUrl"
                :href="previewDoc.blobUrl"
                target="_blank"
                download
                class="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <DownloadIcon class="size-3.5" />
                Download
              </a>
              <Button variant="ghost" size="icon" class="size-7" @click="closePreview">
                <XIcon class="size-4" />
              </Button>
            </div>
          </div>
          <div v-if="previewDoc.loading" class="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon class="size-4 animate-spin" />
            Preparing your document…
          </div>
          <div v-else-if="previewDoc.error" class="flex flex-1 items-center justify-center px-6 text-center text-sm text-destructive">
            {{ previewDoc.error }}
          </div>
          <iframe
            v-else-if="previewDoc.type === 'pdf'"
            :src="previewDoc.blobUrl ?? undefined"
            class="w-full flex-1 rounded-b-lg border-0"
          />
          <div v-else class="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
            <span>Word documents cannot be previewed inline.</span>
            <a
              :href="previewDoc.blobUrl ?? undefined"
              download
              class="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <DownloadIcon class="size-3.5" />
              Download Word document
            </a>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
