<script setup lang="ts">
import {
  CheckIcon,
  ClipboardCheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  FileTextIcon,
  GlobeIcon,
  Loader2Icon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from '@lucide/vue'
import { renderMarkdown } from '~/utils/markdown'
import { vHighlight } from '~/directives/highlight'
import ActivityTimeline from '~/components/ActivityTimeline.vue'
import CitedText from '~/components/CitedText.vue'
import type { ChatActivityStep, ChatMessage, ChatSource } from '~/types/chat'

const props = defineProps<{
  message: ChatMessage
  displayContent: string
  isStreaming: boolean
  statusLabel: string | null
  activitySteps: ChatActivityStep[]
  awaitingIntake: boolean
  searchQuery?: string
  activeSearchId?: string | null
}>()

const emit = defineEmits<{
  'markdown-click': [event: MouseEvent, message: ChatMessage]
  rate: [message: ChatMessage, feedback: 'up' | 'down']
  export: [message: ChatMessage, type: 'word' | 'pdf']
}>()

const persisted = computed(() => !props.message.id.startsWith('local-'))
const copied = ref(false)

interface IntakePair {
  key: string
  label: string
  value: string
}

function intakePairs(content: string): IntakePair[] | null {
  if (!content.startsWith('[Intake Form Submission]')) return null
  const pairs: IntakePair[] = []
  for (const line of content.split('\n').slice(1)) {
    const idx = line.indexOf(': ')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    pairs.push({
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
      value: line.slice(idx + 2).trim(),
    })
  }
  return pairs.length > 0 ? pairs : null
}

function webSourcesFor(m: ChatMessage): ChatSource[] {
  return m.sources.filter((s) => s.type === 'web')
}

function nonWebSources(m: ChatMessage): ChatSource[] {
  return m.sources.filter((s) => s.type !== 'web')
}

function parseUrl(url: string): { hostname: string; pathname: string } {
  try {
    const parsed = new URL(url)
    return { hostname: parsed.hostname, pathname: parsed.pathname }
  } catch {
    return { hostname: url, pathname: '' }
  }
}

function faviconUrl(url?: string | null): string | undefined {
  if (!url) return undefined
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parseUrl(url).hostname)}&sz=64`
}

function openUrl(url?: string | null) {
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}

async function copyContent() {
  try {
    await navigator.clipboard.writeText(props.message.content)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = props.message.content
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  }
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 1500)
}

const showThinking = computed(
  () =>
    props.message.role === 'assistant'
    && props.isStreaming
    && !props.message.content
    && !props.awaitingIntake,
)

function canExport(m: ChatMessage): boolean {
  return m.content.trim().includes('/export/')
}

const searchQuery = computed(() => props.searchQuery?.trim().toLowerCase() ?? '')
const matchesSearch = computed(
  () => searchQuery.value !== '' && props.message.content.toLowerCase().includes(searchQuery.value),
)
const isActiveSearch = computed(
  () => matchesSearch.value && props.activeSearchId === props.message.id,
)
</script>

<template>
  <div
    class="group flex items-start gap-3 transition-all"
    :class="[
      message.role === 'user' ? 'flex-row-reverse' : '',
      matchesSearch ? 'rounded-xl ring-1 ring-primary/40' : '',
      isActiveSearch ? 'bg-primary/10 ring-2 ring-primary' : '',
      searchQuery !== '' && !matchesSearch ? 'opacity-40' : '',
    ]"
  >
    <div
      v-if="message.role === 'user'"
      class="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground"
    >
      You
    </div>

    <div class="flex min-w-0 flex-1 flex-col" :class="message.role === 'user' ? 'items-end' : 'items-start'">
      <!-- Streaming "thinking" card before any content arrives -->
      <div
        v-if="showThinking"
        class="w-full max-w-[85%] rounded-2xl border bg-card/60 px-4 py-3 text-sm"
      >
        <span class="inline-flex items-center gap-2 text-muted-foreground">
          <Loader2Icon class="size-3.5 animate-spin text-primary" />
          {{ statusLabel ?? 'Thinking…' }}
        </span>
        <ActivityTimeline v-if="activitySteps.length > 0" :steps="activitySteps" class="mt-3" />
      </div>

      <!-- Message body -->
      <div v-else class="flex min-w-0 max-w-[85%] flex-col">
        <!-- User -->
        <template v-if="message.role === 'user'">
          <template v-if="intakePairs(message.content)">
            <div class="w-full rounded-2xl border bg-card/80 px-4 py-3 shadow-sm">
              <p class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                <ClipboardCheckIcon class="size-3.5" />
                Intake Form Submitted
              </p>
              <dl class="mt-2.5 space-y-2">
                <div v-for="pair in intakePairs(message.content)" :key="pair.key">
                  <dt class="text-[10px] uppercase tracking-wide text-muted-foreground/80">{{ pair.label }}</dt>
                  <dd v-highlight="searchQuery" class="mt-0.5 whitespace-pre-wrap break-words text-[13px]">{{ pair.value || '—' }}</dd>
                </div>
              </dl>
            </div>
          </template>
          <template v-else>
            <div v-highlight="searchQuery" class="whitespace-pre-wrap break-words rounded-2xl bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
              {{ message.content }}
            </div>
          </template>
        </template>

        <!-- Assistant -->
        <template v-else>
          <div
            v-highlight="searchQuery"
            class="break-words text-[0.95rem] leading-7"
            v-html="renderMarkdown(displayContent)"
            @click="emit('markdown-click', $event, message)"
          />

          <!-- Hover actions -->
          <div
            v-if="persisted && !showThinking"
            class="-mt-0.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-lg:opacity-100"
          >
            <Button variant="ghost" size="icon" class="size-7 text-muted-foreground" title="Copy" @click="copyContent">
              <CheckIcon v-if="copied" class="size-3.5 text-forest dark:text-peach" />
              <CopyIcon v-else class="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="size-7 text-muted-foreground"
              :class="{ 'bg-primary/10 text-primary': message.feedback === 'up' }"
              :title="message.feedback === 'up' ? 'Remove rating' : 'Helpful'"
              @click="emit('rate', message, 'up')"
            >
              <ThumbsUpIcon class="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="size-7 text-muted-foreground"
              :class="{ 'bg-destructive/10 text-destructive': message.feedback === 'down' }"
              :title="message.feedback === 'down' ? 'Remove rating' : 'Not helpful'"
              @click="emit('rate', message, 'down')"
            >
              <ThumbsDownIcon class="size-3.5" />
            </Button>
          </div>

          <!-- Export actions -->
          <div v-if="persisted && canExport(message)" class="mt-1.5 flex items-center gap-1.5">
            <span class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Export</span>
            <Button variant="outline" size="sm" class="h-7 gap-1.5 px-2.5 text-xs" @click="emit('export', message, 'word')">
              <FileTextIcon class="size-3.5" />
              Word
            </Button>
            <Button variant="outline" size="sm" class="h-7 gap-1.5 px-2.5 text-xs" @click="emit('export', message, 'pdf')">
              <FileTextIcon class="size-3.5" />
              PDF
            </Button>
          </div>
        </template>
      </div>

      <!-- Web sources -->
      <div v-if="message.role === 'assistant' && webSourcesFor(message).length > 0" class="mt-2 w-full max-w-[85%] space-y-2">
        <p class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Web sources</p>
        <div
          v-for="(source, index) in webSourcesFor(message)"
          :key="`web-${index}`"
          class="rounded-xl border bg-card p-3 transition-colors hover:border-primary/40"
        >
          <div class="flex items-start gap-2.5">
            <img
              v-if="faviconUrl(source.url)"
              :src="faviconUrl(source.url)"
              alt=""
              class="mt-0.5 size-4 shrink-0 rounded-sm"
              loading="lazy"
            />
            <GlobeIcon v-else class="mt-0.5 size-4 shrink-0 text-primary" />
            <p class="min-w-0 flex-1 break-words text-sm font-medium leading-tight">{{ source.title || source.label }}</p>
            <Button v-if="source.url" variant="ghost" size="icon" class="-mr-1 -mt-1 size-7 text-muted-foreground" title="Open source" @click="openUrl(source.url)">
              <ExternalLinkIcon class="size-3.5" />
            </Button>
          </div>
          <CitedText v-if="source.excerpt" :text="source.excerpt" :clamp="3" />
        </div>
      </div>

      <!-- Non-web sources (inline on small screens only) -->
      <div v-if="message.role === 'assistant' && nonWebSources(message).length > 0" class="mt-2 w-full max-w-[85%] space-y-1.5 lg:hidden">
        <p class="text-xs font-medium text-muted-foreground">Sources</p>
        <div
          v-for="(source, index) in nonWebSources(message)"
          :key="`${source.label}-${index}`"
          class="rounded-xl border bg-card p-3"
        >
          <div class="flex items-start gap-2">
            <Badge variant="secondary" class="mt-0.5 h-5 shrink-0 text-[10px]">
              {{ source.type === 'legal' ? 'LEGAL' : 'DOCUMENT' }}
            </Badge>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium leading-tight">{{ source.title || source.label }}</p>
              <p v-if="source.title && source.label && source.title !== source.label" class="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                {{ source.label }}
              </p>
              <a
                v-if="source.url"
                :href="source.url"
                target="_blank"
                rel="noopener noreferrer"
                class="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                <ExternalLinkIcon class="size-3" />
                {{ parseUrl(source.url).hostname }}{{ parseUrl(source.url).pathname.length > 1 ? parseUrl(source.url).pathname : '' }}
              </a>
            </div>
          </div>
          <CitedText v-if="source.excerpt" :text="source.excerpt" :clamp="2" />
        </div>
      </div>
    </div>
  </div>
</template>
