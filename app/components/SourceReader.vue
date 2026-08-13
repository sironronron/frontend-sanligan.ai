<script setup lang="ts">
import { BookOpenIcon, ExternalLinkIcon, Loader2Icon, XIcon } from '@lucide/vue'
import { categoryLabel } from '~/lib/legalCategories'

/**
 * Reads a cited authority inside Batayan instead of sending the user to the
 * publisher's site.
 *
 * The passages the answer actually relied on are highlighted, which is the
 * whole point: the reader can see the quoted text in its surrounding context
 * and judge whether the answer used it fairly.
 */
interface ReaderChunk {
  id: string
  index: number
  content: string
}

interface ReaderPage {
  id: string
  title: string | null
  law_name: string | null
  gr_number: string | null
  promulgation_date: string | null
  url: string | null
  source_name: string | null
  category: string
  kind: string
  digest: string | null
  has_digest: boolean
  chunks: ReaderChunk[]
}

const props = defineProps<{
  pageId: string
  /** Chunk indices the answer cited, highlighted and scrolled to. */
  citedIndexes?: number[]
}>()

const emit = defineEmits<{ close: [] }>()

const api = useApi()

const page = ref<ReaderPage | null>(null)
const loading = ref(true)
const error = ref('')
const body = ref<HTMLElement | null>(null)

const cited = computed(() => new Set(props.citedIndexes ?? []))

const heading = computed(() =>
  page.value?.law_name || page.value?.gr_number || page.value?.title || 'Legal source',
)

/** Digest lines arrive as "Label: text"; split so the label can be emphasised. */
const digestLines = computed(() => {
  if (!page.value?.digest) return []

  return page.value.digest
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^([A-Z][A-Za-z ]{2,20}):\s*(.*)$/.exec(line)

      return match ? { label: match[1], text: match[2] } : { label: null, text: line }
    })
})

async function load() {
  loading.value = true
  error.value = ''

  try {
    const { data } = await api<{ data: ReaderPage }>(`/legal-pages/${props.pageId}`)
    page.value = data

    await nextTick()
    // Land on the first cited passage rather than the top of a long decision.
    body.value?.querySelector('[data-cited="true"]')?.scrollIntoView({ block: 'center' })
  } catch (err: any) {
    error.value = err?.data?.message ?? 'This source could not be opened.'
  } finally {
    loading.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

watch(() => props.pageId, load, { immediate: true })

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" @click.self="emit('close')">
      <div class="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
        <div class="flex items-start justify-between gap-3 border-b px-5 py-3.5">
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold">{{ heading }}</p>
            <p class="mt-0.5 truncate text-xs text-muted-foreground">
              <span v-if="page?.gr_number && page?.law_name">{{ page.gr_number }} · </span>
              <span v-if="page?.promulgation_date">{{ page.promulgation_date }} · </span>
              <span class="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{{ categoryLabel(page?.category) }}</span>
              <span v-if="page?.kind === 'uploaded'" class="ml-1 text-[10px] uppercase tracking-wide">· uploaded</span>
              <span class="ml-1">{{ page?.source_name ?? 'Knowledge base' }}</span>
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <a
              v-if="page?.url"
              :href="page.url"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ExternalLinkIcon class="size-3.5" />
              Original
            </a>
            <button
              type="button"
              class="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close"
              @click="emit('close')"
            >
              <XIcon class="size-4" />
            </button>
          </div>
        </div>

        <div v-if="loading" class="flex flex-1 items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2Icon class="size-4 animate-spin" />
          Opening source…
        </div>

        <p v-else-if="error" class="p-8 text-center text-sm text-destructive">{{ error }}</p>

        <div v-else ref="body" class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div v-if="digestLines.length" class="mb-5 rounded-lg border bg-muted/40 p-4">
            <p class="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <BookOpenIcon class="size-3.5" />
              Digest
            </p>
            <div class="space-y-1.5 text-sm leading-relaxed">
              <p v-for="(line, i) in digestLines" :key="i">
                <span v-if="line.label" class="font-medium">{{ line.label }}:</span>
                {{ line.text }}
              </p>
            </div>
          </div>

          <p v-if="cited.size" class="mb-3 text-xs text-muted-foreground">
            Highlighted passages are what the answer relied on.
          </p>

          <div class="space-y-3">
            <p
              v-for="chunk in page?.chunks ?? []"
              :key="chunk.id"
              :data-cited="cited.has(chunk.index) ? 'true' : 'false'"
              class="whitespace-pre-wrap rounded-md text-sm leading-relaxed transition-colors"
              :class="cited.has(chunk.index)
                ? 'bg-peach/40 px-3 py-2 ring-1 ring-primary/30 dark:bg-primary/15'
                : 'text-muted-foreground'"
            >{{ chunk.content }}</p>
          </div>

          <p v-if="(page?.chunks ?? []).length === 0" class="py-10 text-center text-sm text-muted-foreground">
            The text of this source has not been indexed yet.
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>
