<script setup lang="ts">
import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  FileTextIcon,
  GlobeIcon,
  ScaleIcon,
  XIcon,
} from '@lucide/vue'

export interface CitationSource {
  type: 'legal' | 'document' | 'web'
  index?: number
  id?: string
  chunk_index?: number
  document_id?: string
  label?: string | null
  law_name?: string | null
  gr_number?: string | null
  promulgation_date?: string | null
  source_name?: string | null
  url?: string | null
  title?: string | null
  excerpt?: string
  content?: string
  domain?: string | null
}

const props = defineProps<{
  message: { id: string; content: string; sources: CitationSource[] } | null
  activeCitation: { kind: string; index: number } | null
}>()

const emit = defineEmits<{ close: [] }>()

const panelEl = ref<HTMLElement | null>(null)
const cardEls = ref<Record<string, HTMLElement | null>>({})
const copiedKey = ref<string | null>(null)

function domainOf(url?: string | null): string {
  if (!url) return ''
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function pathOf(url?: string | null): string {
  if (!url) return ''
  try {
    const { pathname } = new URL(url)
    return pathname.length > 1 ? pathname : ''
  } catch {
    return ''
  }
}

function faviconUrl(url?: string | null): string | undefined {
  if (!url) return undefined
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domainOf(url))}&sz=64`
}

function cardKey(source: CitationSource): string {
  return `${source.type}-${source.index ?? 0}`
}

function setCardRef(key: string, el: unknown) {
  cardEls.value[key] = el as HTMLElement | null
}

function openUrl(url: string | null | undefined) {
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}

async function copyText(source: CitationSource) {
  const text = source.url ?? source.content ?? ''
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  }
  const key = cardKey(source)
  copiedKey.value = key
  setTimeout(() => {
    if (copiedKey.value === key) copiedKey.value = null
  }, 1500)
}

watch(
  () => props.activeCitation,
  (citation) => {
    if (!citation) return
    const key = `${citation.kind}-${citation.index}`
    nextTick(() => {
      const card = cardEls.value[key]
      if (card && panelEl.value) {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        card.classList.remove('citation-flash')
        void card.offsetWidth
        card.classList.add('citation-flash')
      }
    })
  },
)
</script>

<template>
  <aside ref="panelEl" class="relative hidden w-80 shrink-0 flex-col border-l bg-background lg:flex">
    <div class="flex items-center justify-between border-b px-4 py-2.5">
      <span class="text-sm font-medium">Citations</span>
      <Button variant="ghost" size="icon" class="size-7" aria-label="Close citations" @click="emit('close')">
        <XIcon class="size-4" />
      </Button>
    </div>

    <div class="flex-1 overflow-y-auto p-3">
      <div
        v-if="!message || message.sources.length === 0"
        class="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground"
      >
        Select an assistant response to see its citations.
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="source in message.sources"
          :key="cardKey(source)"
          :ref="(el) => setCardRef(cardKey(source), el)"
          class="citation-card rounded-lg border bg-card p-3 transition-shadow duration-200"
        >
          <div class="flex items-start gap-2.5">
            <img
              v-if="source.type === 'web' && faviconUrl(source.url)"
              :src="faviconUrl(source.url)"
              alt=""
              class="mt-0.5 size-4 shrink-0 rounded-sm"
              loading="lazy"
            />
            <GlobeIcon v-else-if="source.type === 'web'" class="mt-0.5 size-4 shrink-0 text-primary" />
            <ScaleIcon v-else-if="source.type === 'legal'" class="mt-0.5 size-4 shrink-0 text-primary" />
            <FileTextIcon v-else class="mt-0.5 size-4 shrink-0 text-primary" />

            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <Badge variant="secondary" class="h-4 px-1.5 text-[9px] uppercase tracking-wide">
                  {{ source.type }}
                </Badge>
                <span v-if="source.index" class="text-[10px] font-semibold text-muted-foreground/70">#{{ source.index }}</span>
              </div>
              <p class="mt-1 break-words text-sm font-medium leading-tight">{{ source.title || source.label }}</p>
              <p v-if="source.title && source.label && source.title !== source.label" class="mt-0.5 line-clamp-2 break-words text-xs text-muted-foreground">
                {{ source.label }}
              </p>
              <a
                v-if="source.url"
                :href="source.url"
                target="_blank"
                rel="noopener noreferrer"
                class="mt-1 inline-flex items-center gap-1 break-all text-[11px] text-primary hover:underline"
              >
                {{ domainOf(source.url) }}{{ pathOf(source.url) }}
              </a>
            </div>

            <div class="flex shrink-0 flex-col gap-1">
              <Button
                v-if="source.url"
                variant="outline"
                size="icon"
                class="size-6"
                title="Visit"
                @click="openUrl(source.url)"
              >
                <ExternalLinkIcon class="size-3" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                class="size-6"
                :title="source.url ? 'Copy link' : 'Copy cited text'"
                @click="copyText(source)"
              >
                <CheckIcon v-if="copiedKey === cardKey(source)" class="size-3 text-emerald-600" />
                <CopyIcon v-else class="size-3" />
              </Button>
            </div>
          </div>

          <div
            v-if="source.type === 'document' && source.content"
            class="mt-2.5 rounded-md border-l-2 border-primary/50 bg-primary/5 px-2.5 py-2"
          >
            <p class="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">Cited text</p>
            <p class="whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">{{ source.content }}</p>
          </div>
          <p v-else-if="source.excerpt" class="mt-2 line-clamp-3 text-xs text-muted-foreground">
            {{ source.excerpt }}
          </p>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.citation-card.citation-flash {
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--primary) 55%, transparent);
  border-color: color-mix(in oklab, var(--primary) 55%, transparent);
}
</style>
