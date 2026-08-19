<script setup lang="ts">
import { ExternalLinkIcon, FileTextIcon, Loader2Icon, QuoteIcon, ScrollTextIcon, SparklesIcon, XIcon } from '@lucide/vue'
import { renderMarkdown } from '~/utils/markdown'
import { citationDate, markCitedHtml, parseDigest } from '~/utils/citations'
import type { CitationChunk, CitationReading } from '~/types/citations'

/**
 * The whole source, opened over the conversation, with the passages the answer
 * actually relied on marked in place.
 *
 * Highlighting is by chunk index rather than by matching the excerpt text: the
 * chunks are the units retrieval cites, so the marked passage is exactly what
 * the model was given — a text search would only approximate it, and would
 * mark every other paragraph that happens to repeat the phrase.
 */
const props = defineProps<{
  reading: CitationReading | null
  view: 'digest' | 'full'
  highlight: number[]
  loading: boolean
  error: string
}>()

const emit = defineEmits<{
  close: []
  'update:view': ['digest' | 'full']
}>()

const body = ref<HTMLElement | null>(null)

const highlighted = computed(() => new Set(props.highlight))

const citedCount = computed(
  () => props.reading?.chunks.filter((chunk) => highlighted.value.has(chunk.index)).length ?? 0,
)

const uploadedLabel = computed(() => citationDate(props.reading?.uploadedAt ?? null))

/**
 * The digest as labelled sections. Empty when the stored digest predates the
 * labelled format (or the model ignored it), in which case it is rendered as
 * plain markdown instead of being forced into a layout it does not fit.
 */
const digestSections = computed(() => parseDigest(props.reading?.digest ?? ''))

/**
 * One passage as rendered HTML, with the highlight applied to its words when
 * the answer drew on it.
 */
function passageHtml(chunk: CitationChunk): string {
  const html = renderMarkdown(chunk.content)

  return highlighted.value.has(chunk.index) ? markCitedHtml(html) : html
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

/**
 * Land the reader on the cited passage rather than at the top of a
 * hundred-paragraph decision — finding it by hand is the whole friction this
 * popup exists to remove.
 */
async function scrollToCitation() {
  await nextTick()
  const target = body.value?.querySelector<HTMLElement>('[data-cited="true"]')
  if (!target) return
  target.scrollIntoView({ block: 'center' })
}

watch(
  () => [props.reading?.id, props.view] as const,
  ([id, view]) => {
    if (id && view === 'full') void scrollToCitation()
  },
  { immediate: true },
)

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[120] flex items-center justify-center p-4 backdrop-blur-sm"
      style="background: rgb(0 0 0 / 0.45)"
      role="dialog"
      aria-modal="true"
      aria-label="Cited source"
      @click.self="emit('close')"
    >
      <div class="flex max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <!-- Header -->
        <div class="flex items-start gap-3 border-b px-5 py-3.5">
          <div class="min-w-0 flex-1">
            <h2 class="truncate text-sm font-semibold">
              {{ reading?.title ?? 'Opening source…' }}
            </h2>
            <p v-if="reading?.subtitle" class="mt-0.5 truncate text-xs text-muted-foreground">
              {{ reading.subtitle }}
            </p>
            <div v-if="reading" class="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span
                v-for="tag in reading.tags"
                :key="tag.id"
                class="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {{ tag.name }}
              </span>
              <span v-if="uploadedLabel" class="text-[10px] text-muted-foreground">
                Uploaded {{ uploadedLabel }}
              </span>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <a
              v-if="reading?.url"
              :href="reading.url"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
            >
              <ExternalLinkIcon class="size-3.5" />
              Original
            </a>
            <Button variant="ghost" size="icon" class="size-7" aria-label="Close" @click="emit('close')">
              <XIcon class="size-4" />
            </Button>
          </div>
        </div>

        <!-- Digest / full text -->
        <div v-if="reading" class="flex items-center gap-2 border-b px-5 py-2">
          <div class="inline-flex rounded-lg border bg-muted/50 p-0.5">
            <button
              v-if="reading.hasDigest"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
              :class="view === 'digest'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'"
              @click="emit('update:view', 'digest')"
            >
              <SparklesIcon class="size-3.5" />
              Digest
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
              :class="view === 'full'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'"
              @click="emit('update:view', 'full')"
            >
              <ScrollTextIcon class="size-3.5" />
              Full text
            </button>
          </div>

          <span class="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span class="cite-mark">cited</span>
            <template v-if="view === 'full' && citedCount > 0">
              {{ citedCount }} {{ citedCount === 1 ? 'passage' : 'passages' }} highlighted
            </template>
            <template v-else>text is highlighted</template>
          </span>
        </div>

        <!-- Body -->
        <div ref="body" class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div v-if="loading" class="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2Icon class="size-4 animate-spin" />
            Opening source…
          </div>

          <p v-else-if="error" class="py-16 text-center text-sm text-destructive">
            {{ error }}
          </p>

          <dl v-else-if="reading && view === 'digest' && digestSections.length > 0" class="space-y-3.5">
            <div v-for="section in digestSections" :key="section.label" class="digest-section">
              <dt class="digest-section__label">{{ section.label }}</dt>
              <dd class="digest-section__body">
                <p v-if="section.body" class="text-[0.95rem] leading-7">{{ section.body }}</p>
                <ul v-if="section.bullets.length > 0" class="mt-1.5 space-y-1">
                  <li
                    v-for="(bullet, i) in section.bullets"
                    :key="i"
                    class="relative pl-4 text-[0.95rem] leading-7 before:absolute before:left-0 before:text-muted-foreground before:content-['\\2022']"
                  >
                    {{ bullet }}
                  </li>
                </ul>
              </dd>
            </div>
          </dl>

          <div
            v-else-if="reading && view === 'digest'"
            class="batayan-prose text-[0.95rem] leading-7"
            v-html="renderMarkdown(reading.digest ?? '')"
          />

          <div v-else-if="reading && reading.chunks.length > 0" class="space-y-2">
            <div
              v-for="chunk in reading.chunks"
              :key="chunk.id"
              :data-cited="highlighted.has(chunk.index) ? 'true' : undefined"
              class="cite-passage"
              :class="highlighted.has(chunk.index)
                ? 'cite-passage--cited'
                : 'cite-passage--dim'"
            >
              <span v-if="highlighted.has(chunk.index)" class="cite-passage__tag">
                <QuoteIcon class="size-3" />
                Cited
              </span>
              <!--
                Rendered as markdown, not as pre-wrapped text: extraction now
                keeps the document's own structure, so a decision's headings
                are headings and its enumerated paragraphs are a list. The
                cited mark stays on the chunk, which is the unit retrieval
                cites, so highlighting is unaffected by how it is rendered.
              -->
              <div class="batayan-prose" v-html="passageHtml(chunk)" />
            </div>
          </div>

          <div v-else-if="reading" class="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
            <FileTextIcon class="size-5" />
            No readable text was extracted from this source.
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
