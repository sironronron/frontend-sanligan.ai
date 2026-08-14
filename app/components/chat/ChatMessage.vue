<script setup lang="ts">
import {
  CheckIcon,
  ClipboardCheckIcon,
  CopyIcon,
  DownloadIcon,
  FileTextIcon,
  Loader2Icon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import { renderMarkdown } from '~/utils/markdown'
import { vHighlight } from '~/directives/highlight'
import ActivityTimeline from '~/components/ActivityTimeline.vue'
import type { ChatActivityStep, ChatMessage, ChatMessageAttachment } from '~/types/chat'

const props = defineProps<{
  message: ChatMessage
  displayContent: string
  isStreaming: boolean
  statusLabel: string | null
  topic: string | null
  activitySteps: ChatActivityStep[]
  awaitingIntake: boolean
  searchQuery?: string
  activeSearchId?: string | null
  activeSearchOccurrence?: number
}>()

const emit = defineEmits<{
  'markdown-click': [event: MouseEvent, message: ChatMessage]
  rate: [message: ChatMessage, feedback: 'up' | 'down']
  export: [message: ChatMessage, type: 'word' | 'pdf']
}>()

const persisted = computed(() => !props.message.id.startsWith('local-'))
const copied = ref(false)

const { download: downloadDocument } = useDocumentFile()
const { fileIcon } = useFileTypeIcon()

const attachments = computed<ChatMessageAttachment[]>(() => props.message.attachments ?? [])

const downloading = ref<string | null>(null)

async function openAttachment(attachment: ChatMessageAttachment) {
  if (downloading.value) return
  downloading.value = attachment.id
  try {
    await downloadDocument(attachment.id, attachment.original_filename)
  } catch {
    toast.error(`Could not open "${attachment.original_filename}"`)
  } finally {
    downloading.value = null
  }
}

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

const showStreamingStatus = computed(
  () =>
    props.message.role === 'assistant'
    && props.isStreaming
    && props.message.content
    && props.statusLabel
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

const highlightValue = computed(() => ({
  query: props.searchQuery ?? '',
  active: isActiveSearch.value ? props.activeSearchOccurrence ?? 0 : null,
}))
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
        class="thinking-card w-full max-w-[85%] rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card px-4 py-3.5 text-sm shadow-sm"
      >
        <div class="flex items-center gap-2.5">
          <span class="relative flex size-5 items-center justify-center">
            <span class="absolute size-full animate-ping rounded-full bg-primary/20" />
            <Loader2Icon class="size-3.5 animate-spin text-primary" />
          </span>
          <!--
            The heading names the subject once. The per-step detail lives in
            the timeline below, so the two no longer say the same sentence.
          -->
          <span class="min-w-0 font-medium text-foreground/90">
            <template v-if="topic">Researching <span class="text-primary">{{ topic }}</span></template>
            <template v-else>{{ statusLabel ?? 'Thinking…' }}</template>
          </span>
        </div>
        <ActivityTimeline v-if="activitySteps.length > 0" :steps="activitySteps" class="mt-3" />
      </div>

      <!-- Message body -->
      <div v-else class="flex min-w-0 max-w-[85%] flex-col">
        <!-- User -->
        <template v-if="message.role === 'user'">
          <!-- Files sent with this message -->
          <ul v-if="attachments.length > 0" class="mb-1.5 flex flex-wrap justify-end gap-1.5">
            <li v-for="attachment in attachments" :key="attachment.id">
              <button
                type="button"
                class="flex max-w-full items-center gap-1.5 rounded-lg border bg-card px-2 py-1 text-xs transition-colors hover:bg-accent disabled:opacity-60"
                :title="`Download ${attachment.original_filename}`"
                :disabled="downloading === attachment.id"
                @click="openAttachment(attachment)"
              >
                <Loader2Icon v-if="downloading === attachment.id" class="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                <component :is="fileIcon(attachment.original_filename, attachment.mime_type)" v-else class="size-3.5 shrink-0 text-muted-foreground" />
                <span class="min-w-0 truncate font-medium">{{ attachment.original_filename }}</span>
                <span v-if="attachment.status === 'failed'" class="shrink-0 text-destructive">· Failed</span>
              </button>
            </li>
          </ul>

          <template v-if="intakePairs(message.content)">
            <div class="w-full rounded-2xl border bg-card/80 px-4 py-3 shadow-sm">
              <p class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                <ClipboardCheckIcon class="size-3.5" />
                Intake Form Submitted
              </p>
              <dl class="mt-2.5 space-y-2">
                <div v-for="pair in intakePairs(message.content)" :key="pair.key">
                  <dt class="text-[10px] uppercase tracking-wide text-muted-foreground/80">{{ pair.label }}</dt>
                  <dd v-highlight="highlightValue" class="mt-0.5 whitespace-pre-wrap break-words text-[13px]">{{ pair.value || '—' }}</dd>
                </div>
              </dl>
            </div>
          </template>
          <template v-else>
            <div v-highlight="highlightValue" class="whitespace-pre-wrap break-words rounded-2xl bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
              {{ message.content }}
            </div>
          </template>
        </template>

        <!-- Assistant -->
        <template v-else>
          <div
            v-if="showStreamingStatus"
            class="mb-2.5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs text-muted-foreground shadow-sm"
          >
            <span class="relative flex size-3.5 items-center justify-center">
              <span class="absolute size-full animate-ping rounded-full bg-primary/25" />
              <Loader2Icon class="size-2.5 animate-spin text-primary" />
            </span>
            <span class="font-medium">{{ statusLabel }}</span>
          </div>
          <div
            v-highlight="highlightValue"
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
          <div v-if="persisted && canExport(message)" class="mt-2 flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              class="h-8 gap-1.5 px-3 text-xs font-medium shadow-sm transition-all hover:bg-primary/5 hover:text-primary hover:border-primary/30"
              @click="emit('export', message, 'word')"
            >
              <FileTextIcon class="size-3.5" />
              Word
            </Button>
            <Button
              variant="outline"
              size="sm"
              class="h-8 gap-1.5 px-3 text-xs font-medium shadow-sm transition-all hover:bg-destructive/5 hover:text-destructive hover:border-destructive/30"
              @click="emit('export', message, 'pdf')"
            >
              <DownloadIcon class="size-3.5" />
              PDF
            </Button>
          </div>
        </template>
      </div>

      <!-- Cited sources: the inline numbers in the answer text are the only
           citation affordance now — no cards, panels, or popovers. -->
    </div>
  </div>
</template>
