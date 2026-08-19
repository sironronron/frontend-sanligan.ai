<script setup lang="ts">
import { CheckIcon, ClipboardCheckIcon, Loader2Icon } from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import { vHighlight } from '~/directives/highlight'
import type { ChatMessage, ChatMessageAttachment } from '~/types/chat'

/**
 * The reader's own turn.
 *
 * This is the one side that keeps a bubble. Assistant answers run long and are
 * set as prose on the page, so the contrast between a contained question and
 * an uncontained answer is what makes the conversation readable without either
 * side needing a name on it.
 *
 * Two of these "messages" are not really messages: an intake submission and a
 * choice selection are transport formats the model reads. They are rendered as
 * what the reader actually did — a filled form, a decision made — rather than
 * as the bracketed payload that carries it.
 */
const props = defineProps<{
  message: ChatMessage
  highlight: { query: string, active: number | null }
}>()

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

interface Pair {
  key: string
  label: string
  value: string
}

const intakePairs = computed<Pair[] | null>(() => {
  const content = props.message.content
  if (!content.startsWith('[Intake Form Submission]')) return null

  const pairs: Pair[] = []

  for (const line of content.split('\n').slice(1)) {
    const index = line.indexOf(': ')
    if (index === -1) continue

    const key = line.slice(0, index).trim()

    pairs.push({
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
      value: line.slice(index + 2).trim(),
    })
  }

  return pairs.length > 0 ? pairs : null
})

const choicePairs = computed<Pair[] | null>(() => {
  const content = props.message.content
  if (!content.startsWith('[Choice Selection]')) return null

  const pairs: Pair[] = []
  let question = ''

  for (const line of content.split('\n').slice(1)) {
    const text = line.trim()

    if (text.startsWith('Q: ')) question = text.slice(3).trim()
    else if (text.startsWith('A: ') && question !== '') {
      pairs.push({ key: question, label: question, value: text.slice(3).trim() })
      question = ''
    }
  }

  return pairs.length > 0 ? pairs : null
})

const structured = computed(() => intakePairs.value ?? choicePairs.value)
</script>

<template>
  <div class="batayan-turn-in flex flex-col items-end gap-1.5">
    <ul v-if="attachments.length > 0" class="flex max-w-[85%] flex-wrap justify-end gap-1.5">
      <li v-for="attachment in attachments" :key="attachment.id">
        <button
          type="button"
          class="flex max-w-full items-center gap-1.5 rounded-lg border bg-card px-2 py-1 text-xs transition-colors hover:bg-accent disabled:opacity-60"
          :title="`Download ${attachment.original_filename}`"
          :disabled="downloading === attachment.id"
          @click="openAttachment(attachment)"
        >
          <Loader2Icon
            v-if="downloading === attachment.id"
            class="size-3.5 shrink-0 animate-spin text-muted-foreground"
          />
          <component
            :is="fileIcon(attachment.original_filename, attachment.mime_type)"
            v-else
            class="size-3.5 shrink-0 text-muted-foreground"
          />
          <span class="min-w-0 truncate font-medium">{{ attachment.original_filename }}</span>
          <span v-if="attachment.status === 'failed'" class="shrink-0 text-destructive">· Failed</span>
        </button>
      </li>
    </ul>

    <!-- A form the reader filled in, or a decision they made. -->
    <div
      v-if="structured"
      class="w-full max-w-[85%] rounded-2xl border bg-card px-3.5 py-3 shadow-sm sm:max-w-[75%]"
    >
      <p class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
        <ClipboardCheckIcon v-if="intakePairs" class="size-3" />
        <CheckIcon v-else class="size-3" />
        {{ intakePairs ? 'Details you provided' : 'Your choice' }}
      </p>
      <dl class="mt-2.5 grid gap-2 sm:grid-cols-2">
        <div v-for="pair in structured" :key="pair.key" class="min-w-0">
          <dt class="text-[10px] uppercase tracking-wide text-muted-foreground/75">{{ pair.label }}</dt>
          <dd
            v-highlight="highlight"
            class="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed"
          >
            {{ pair.value || '—' }}
          </dd>
        </div>
      </dl>
    </div>

    <div
      v-else
      v-highlight="highlight"
      class="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-[0.9375rem] leading-relaxed text-primary-foreground shadow-sm sm:max-w-[75%]"
    >
      {{ message.content }}
    </div>
  </div>
</template>
