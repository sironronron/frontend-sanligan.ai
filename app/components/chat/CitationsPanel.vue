<script setup lang="ts">
import {
  ExternalLinkIcon,
  GlobeIcon,
  QuoteIcon,
  ScaleIcon,
  ScrollTextIcon,
  SparklesIcon,
  XIcon,
} from '@lucide/vue'
import { cn } from '~/lib/utils'
import { citationDate, collectCitations, documentTypeLabel, faviconUrl } from '~/utils/citations'
import CitationReaderDialog from '~/components/chat/CitationReaderDialog.vue'
import type { ChatMessage } from '~/types/chat'
import type { CitationEntry, CitationTarget } from '~/types/citations'

/**
 * Everything the thread's answers were grounded in, in one place.
 *
 * The inline numbers in an answer say *that* a sentence is sourced; they
 * cannot say what the source was, which passage it was, or whether it is the
 * client's own upload or a page on the web. This panel is where that is
 * answered, and where a citation can be opened and read without leaving the
 * conversation.
 */
const props = withDefaults(defineProps<{
  messages: ChatMessage[]
  class?: string
  visible?: boolean
  /** The card to scroll to and mark, set when a badge in the answer is pressed. */
  target?: CitationTarget | null
}>(), { class: '', visible: true, target: null })

defineEmits<{ close: [] }>()

const { fileIcon } = useFileTypeIcon()

const {
  reading,
  view: readerView,
  highlight: readerHighlight,
  loading: readerLoading,
  error: readerError,
  open: readerOpen,
  read: openReader,
  close: closeReader,
} = useCitationReader()

const citations = computed(() => collectCitations(props.messages))

const grounded = computed(() => citations.value.filter((entry) => entry.type !== 'web'))
const web = computed(() => citations.value.filter((entry) => entry.type === 'web'))

const list = ref<HTMLElement | null>(null)

/**
 * The card arrived at from a badge in the answer, marked only long enough to
 * be found. It clears itself so a second press of the same badge marks it
 * again rather than leaving an already-lit card looking unchanged.
 */
const revealed = ref<string | null>(null)
let revealTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.target,
  async (target) => {
    if (!target) return

    if (revealTimer !== null) clearTimeout(revealTimer)
    revealed.value = null

    await nextTick()
    revealed.value = target.key

    await nextTick()
    list.value
      ?.querySelector<HTMLElement>(`[data-citation-key="${CSS.escape(target.key)}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })

    revealTimer = setTimeout(() => {
      revealed.value = null
    }, 2000)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (revealTimer !== null) clearTimeout(revealTimer)
})

/** Sites whose favicon failed to load, so the card falls back to a glyph. */
const brokenIcons = ref(new Set<string>())

function iconFailed(key: string) {
  brokenIcons.value = new Set(brokenIcons.value).add(key)
}

function typeLabel(entry: CitationEntry): string {
  if (entry.type === 'document') return documentTypeLabel(entry.label, entry.mimeType)
  return entry.sourceName ?? 'Legal source'
}

/**
 * The one-line "where this came from" under the title: what identifies the
 * authority for a legal source, and how the upload is filed for a document.
 */
function metaLine(entry: CitationEntry): string | null {
  if (entry.type === 'document') {
    const uploaded = citationDate(entry.uploadedAt)
    return uploaded ? `Uploaded ${uploaded}` : null
  }

  return [citationDate(entry.promulgationDate), entry.sourceName]
    .filter(Boolean)
    .join(' · ') || null
}

/** The link as the user would read it — no scheme, no trailing slash. */
function readableUrl(url: string | null): string {
  if (!url) return ''
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}
</script>

<template>
  <div class="contents">
    <div v-if="props.visible" class="fixed inset-0 z-30 bg-black/60 lg:hidden" aria-hidden="true" @click="$emit('close')" />
    <aside
      :class="cn(
        'min-h-0 flex-col overflow-hidden bg-sidebar border-sidebar-border',
        props.visible
          ? 'flex fixed inset-x-0 bottom-0 z-40 max-h-[75dvh] w-full rounded-t-2xl border shadow-2xl'
          : 'hidden',
        'lg:static lg:z-auto lg:flex lg:h-full lg:max-h-none lg:w-96 lg:shrink-0 lg:rounded-none lg:border-l lg:shadow-none',
        props.class,
      )"
    >
      <div class="flex items-center justify-between px-4 pb-2 pt-3">
        <div class="flex items-baseline gap-2">
          <h3 class="text-sm font-semibold">Sources</h3>
          <span v-if="citations.length > 0" class="text-xs tabular-nums text-muted-foreground">
            {{ citations.length }} cited
          </span>
        </div>
        <Button variant="ghost" size="icon" class="size-7" aria-label="Close sources" @click="$emit('close')">
          <XIcon class="size-4" />
        </Button>
      </div>

      <div v-if="citations.length === 0" class="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <QuoteIcon class="size-5 text-muted-foreground" />
        <p class="text-sm font-medium">No sources cited yet</p>
        <p class="text-xs text-muted-foreground">
          When Batayan grounds an answer in the law, your uploads, or the web, every source it used appears here.
        </p>
      </div>

      <div v-else ref="list" class="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-5 pt-1">
        <!-- Law and the user's own documents -->
        <section v-if="grounded.length > 0" class="space-y-2.5">
          <h4 class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Law &amp; your documents
          </h4>

          <article
            v-for="entry in grounded"
            :key="entry.key"
            :data-citation-key="entry.key"
            class="rounded-xl border bg-card p-3 shadow-sm"
            :class="{ 'saligan-citation-target': revealed === entry.key }"
          >
            <div class="flex items-start gap-2.5">
              <!--
                A pill, not a circle: the citation id is a token like "A3", so
                a fixed round badge either clipped it or padded a single digit
                into a bubble. The pill grows with the text and still reads as
                the same mark the answer shows inline.
              -->
              <span
                class="mt-0.5 inline-flex h-5 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary/10 px-1.5 text-[10px] font-bold leading-none tracking-wide text-primary"
                :title="entry.token ? `Cited inline as ${entry.token}` : `Citation ${entry.index}`"
              >
                {{ entry.token ?? entry.index }}
              </span>
              <div class="min-w-0 flex-1">
                <p class="flex items-center gap-1.5 text-[13px] font-medium leading-snug">
                  <component
                    :is="entry.type === 'document' ? fileIcon(entry.label, entry.mimeType) : ScaleIcon"
                    class="size-3.5 shrink-0 text-muted-foreground"
                  />
                  <span class="min-w-0 break-words">{{ entry.label }}</span>
                </p>
                <p class="mt-0.5 text-[11px] text-muted-foreground">
                  {{ typeLabel(entry) }}<template v-if="metaLine(entry)"> · {{ metaLine(entry) }}</template>
                </p>
              </div>

              <!--
                The document code or identifier, set apart on the right so it is
                read as the source's official handle rather than a filing detail.
              -->
              <span
                v-if="entry.type === 'legal' && entry.grNumber"
                class="mt-0.5 shrink-0 rounded-md border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[10px] font-semibold leading-none tracking-wide text-muted-foreground"
              >
                {{ entry.grNumber }}
              </span>
            </div>

            <!-- What the answer actually took from it -->
            <blockquote
              v-for="(excerpt, i) in entry.excerpts"
              :key="i"
              class="mt-2.5 border-l-2 border-primary/40 pl-2.5 text-[12px] leading-relaxed text-muted-foreground"
            >
              {{ excerpt }}
            </blockquote>

            <ul v-if="entry.tags.length > 0" class="mt-2.5 flex flex-wrap gap-1">
              <li
                v-for="tag in entry.tags"
                :key="tag.id"
                class="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {{ tag.name }}
              </li>
            </ul>

            <div class="mt-3 flex flex-wrap items-center gap-1.5">
              <!--
                Digest is offered for anything readable, not only for sources
                already carrying one: a digest is generated the first time
                someone opens a source, so gating the button on `has_digest`
                would mean no upload ever got one. The reader drops to the full
                text when a digest genuinely cannot be produced.
              -->
              <template v-if="entry.readableId">
                <Button
                  variant="outline"
                  size="sm"
                  class="h-7 gap-1.5 px-2.5 text-xs"
                  @click="openReader(entry, 'digest')"
                >
                  <SparklesIcon class="size-3.5" />
                  Digest
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="h-7 gap-1.5 px-2.5 text-xs"
                  @click="openReader(entry, 'full')"
                >
                  <ScrollTextIcon class="size-3.5" />
                  Open
                </Button>
              </template>
              <a
                v-if="entry.url"
                :href="entry.url"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors hover:bg-accent"
              >
                <ExternalLinkIcon class="size-3.5" />
                Original
              </a>
            </div>
          </article>
        </section>

        <!-- Web results the answer was grounded in -->
        <section v-if="web.length > 0" class="space-y-2.5">
          <h4 class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            From the web
          </h4>

          <article
            v-for="entry in web"
            :key="entry.key"
            :data-citation-key="entry.key"
            class="rounded-xl border bg-card p-3 shadow-sm"
            :class="{ 'saligan-citation-target': revealed === entry.key }"
          >
            <div class="flex items-start gap-2.5">
              <img
                v-if="faviconUrl(entry.domain) && !brokenIcons.has(entry.key)"
                :src="faviconUrl(entry.domain) ?? undefined"
                :alt="entry.domain ?? ''"
                class="mt-0.5 size-5 shrink-0 rounded"
                loading="lazy"
                @error="iconFailed(entry.key)"
              >
              <GlobeIcon v-else class="mt-0.5 size-5 shrink-0 text-muted-foreground" />

              <div class="min-w-0 flex-1">
                <p class="break-words text-[13px] font-medium leading-snug">{{ entry.label }}</p>
                <p class="mt-0.5 break-all text-[11px] text-muted-foreground">{{ readableUrl(entry.url) }}</p>
              </div>
            </div>

            <blockquote
              v-for="(excerpt, i) in entry.excerpts"
              :key="i"
              class="mt-2.5 border-l-2 border-primary/40 pl-2.5 text-[12px] leading-relaxed text-muted-foreground"
            >
              {{ excerpt }}
            </blockquote>

            <div class="mt-3">
              <a
                v-if="entry.url"
                :href="entry.url"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors hover:bg-accent"
              >
                <ExternalLinkIcon class="size-3.5" />
                Go to link
              </a>
            </div>
          </article>
        </section>
      </div>
    </aside>

    <CitationReaderDialog
      v-if="readerOpen"
      :reading="reading"
      :view="readerView"
      :highlight="readerHighlight"
      :loading="readerLoading"
      :error="readerError"
      @update:view="readerView = $event"
      @close="closeReader()"
    />
  </div>
</template>
