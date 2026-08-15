<script setup lang="ts">
import {
  DownloadIcon,
  EyeIcon,
  FileTextIcon,
} from '@lucide/vue'
import { useDocumentExport } from '~/composables/useDocumentExport'

definePageMeta({
  middleware: ['auth', 'onboarding', 'subscription'],
})

interface GeneratedDocument {
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

const documents = ref<GeneratedDocument[]>([])
const loading = ref(false)
const { previewDoc, openExport, closePreview } = useDocumentExport()

const view = useViewMode('drafts', 'list')

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

function preview(doc: GeneratedDocument) {
  void openExport(doc.content, 'pdf', doc.title)
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
  <div class="mx-auto w-full max-w-4xl px-4 py-6">
    <PageHeader
      title="Drafts"
      description="Revisit the letters, pleadings, and forms the assistant drafted for you, and download them again."
    />

    <ListSkeleton v-if="loading" :rows="3" />

    <EmptyState
      v-else-if="documents.length === 0"
      :icon="FileTextIcon"
      title="No drafts yet"
      description="Ask the assistant to draft a letter or pleading, then export it from the chat."
    >
      <Button @click="navigateTo('/chat')">Start a draft</Button>
    </EmptyState>

    <div v-else class="space-y-2">
      <div class="flex items-center gap-3">
        <h2 class="text-sm font-medium text-muted-foreground">
          {{ documents.length }} document{{ documents.length === 1 ? '' : 's' }}
        </h2>
        <ViewModeToggle v-model="view" class="ml-auto" />
      </div>

      <!-- List: one dense row each, the layout this page has always had. -->
      <template v-if="view === 'list'">
        <div v-for="doc in documents" :key="doc.id" class="surface overflow-hidden">
          <div class="flex items-center gap-3 p-4">
            <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <FileTextIcon class="size-4 text-primary" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ doc.title }}</p>
              <p class="mt-0.5 truncate text-xs text-muted-foreground">
                <NuxtLink
                  v-if="doc.case_id && doc.case_title"
                  :to="`/cases/${doc.case_id}`"
                  class="font-medium text-primary hover:underline"
                >
                  {{ doc.case_title }}
                </NuxtLink>
                <span v-if="doc.case_id && doc.case_title"> · </span>
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
              <Button variant="outline" size="sm" class="h-7 gap-1.5 px-2.5 text-xs" @click="preview(doc)">
                <EyeIcon class="size-3.5" />
                Preview
              </Button>
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
      </template>

      <!--
        Card: the title gets the room, and the actions sit on their own line at
        the foot so they line up across the grid rather than wherever a long
        title happens to push them.
      -->
      <div v-else-if="view === 'card'" class="grid gap-3 sm:grid-cols-2">
        <div v-for="doc in documents" :key="doc.id" class="surface flex flex-col gap-3 p-4">
          <div class="flex items-start gap-3">
            <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <FileTextIcon class="size-4 text-primary" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="line-clamp-2 text-sm font-medium">{{ doc.title }}</p>
              <p class="mt-1 text-xs text-muted-foreground">{{ formatDate(doc.created_at) }}</p>
            </div>
          </div>

          <div class="min-w-0 space-y-1 text-xs">
            <NuxtLink
              v-if="doc.case_id && doc.case_title"
              :to="`/cases/${doc.case_id}`"
              class="block truncate font-medium text-primary hover:underline"
            >
              {{ doc.case_title }}
            </NuxtLink>
            <NuxtLink
              v-if="doc.conversation_id"
              :to="`/chat?c=${doc.conversation_id}`"
              class="block truncate text-muted-foreground hover:text-foreground hover:underline"
            >
              {{ doc.conversation_title ?? 'Open conversation' }}
            </NuxtLink>
          </div>

          <div class="mt-auto flex flex-wrap items-center gap-2 border-t pt-3">
            <Button variant="outline" size="sm" class="h-7 gap-1.5 px-2.5 text-xs" @click="preview(doc)">
              <EyeIcon class="size-3.5" />
              Preview
            </Button>
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

      <!--
        Table: columns are the point, so it scrolls sideways on a narrow screen
        rather than reflowing into something that is no longer a table.
      -->
      <div v-else class="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead class="hidden sm:table-cell">Case</TableHead>
              <TableHead class="hidden md:table-cell">Conversation</TableHead>
              <TableHead>Created</TableHead>
              <TableHead class="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="doc in documents" :key="doc.id">
              <TableCell class="max-w-[18rem]">
                <div class="flex items-center gap-2">
                  <FileTextIcon class="size-3.5 shrink-0 text-primary" />
                  <span class="truncate text-sm font-medium">{{ doc.title }}</span>
                </div>
              </TableCell>
              <TableCell class="hidden max-w-[12rem] sm:table-cell">
                <NuxtLink
                  v-if="doc.case_id && doc.case_title"
                  :to="`/cases/${doc.case_id}`"
                  class="block truncate text-xs font-medium text-primary hover:underline"
                >
                  {{ doc.case_title }}
                </NuxtLink>
                <span v-else class="text-xs text-muted-foreground">—</span>
              </TableCell>
              <TableCell class="hidden max-w-[12rem] md:table-cell">
                <NuxtLink
                  v-if="doc.conversation_id"
                  :to="`/chat?c=${doc.conversation_id}`"
                  class="block truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  {{ doc.conversation_title ?? 'Open conversation' }}
                </NuxtLink>
                <span v-else class="text-xs text-muted-foreground">—</span>
              </TableCell>
              <TableCell class="whitespace-nowrap text-xs text-muted-foreground">
                {{ formatDate(doc.created_at) }}
              </TableCell>
              <TableCell>
                <!--
                  Icon-only here: three labelled buttons per row turn the
                  actions column into the widest thing on the page.
                -->
                <div class="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="icon" class="size-7" :aria-label="`Preview ${doc.title}`" @click="preview(doc)">
                    <EyeIcon class="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" class="h-7 gap-1 px-2 text-xs" :aria-label="`Download ${doc.title} as Word`" @click="download(doc, 'word')">
                    <DownloadIcon class="size-3.5" />
                    Word
                  </Button>
                  <Button variant="ghost" size="sm" class="h-7 gap-1 px-2 text-xs" :aria-label="`Download ${doc.title} as PDF`" @click="download(doc, 'pdf')">
                    <DownloadIcon class="size-3.5" />
                    PDF
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>

    <DocumentPreviewPanel
      v-if="previewDoc && previewDoc.type !== 'word'"
      :preview="previewDoc"
      dialog
      @close="closePreview"
    />

    <WordPreviewDialog
      v-if="previewDoc?.type === 'word'"
      :title="previewDoc.title"
      :blob-url="previewDoc.blobUrl"
      :loading="previewDoc.loading"
      :error="previewDoc.error"
      @close="closePreview"
    />
  </div>
</template>
