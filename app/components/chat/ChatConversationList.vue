<script setup lang="ts">
import { Loader2Icon, MessageSquareIcon, PlusIcon, TrashIcon } from '@lucide/vue'
import { cn } from '~/lib/utils'
import LabelPicker from '~/components/LabelPicker.vue'
import type { AppliedLabel } from '~/stores/labels'

export interface ConversationItem {
  id: string
  title: string | null
  last_message_at: string | null
  updated_at?: string | null
  tags?: AppliedLabel[]
  case_id?: string | null
  case_tags?: string[]
}

const props = withDefaults(defineProps<{
  conversations: ConversationItem[]
  activeId: string | null
  /** Tag ids the list is currently filtered by. */
  filterTagIds?: string[]
  /**
   * Threads whose answer is still being generated. A thread stays live when the
   * user leaves it, so the list is where they see it is still working — and
   * where they get back to it.
   */
  streamingIds?: string[]
  class?: string
}>(), { class: '', filterTagIds: () => [], streamingIds: () => [] })

defineEmits<{
  new: []
  select: [id: string]
  delete: [id: string]
  'update:filterTagIds': [ids: string[]]
}>()

function isStreaming(id: string): boolean {
  return props.streamingIds.includes(id)
}

/**
 * Same buckets a reader already thinks in — grouping by recency says
 * everything a per-row timestamp used to, without a second line on every row.
 */
function bucketFor(conversation: ConversationItem): string {
  const date = conversation.last_message_at ?? conversation.updated_at
  if (!date) return 'No activity yet'

  const then = new Date(date)
  if (Number.isNaN(then.getTime())) return 'No activity yet'

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const startOfWeek = new Date(startOfToday)
  startOfWeek.setDate(startOfWeek.getDate() - 7)

  if (then >= startOfToday) return 'Today'
  if (then >= startOfYesterday) return 'Yesterday'
  if (then >= startOfWeek) return 'This week'
  return 'Older'
}

const BUCKET_ORDER = ['Today', 'Yesterday', 'This week', 'Older', 'No activity yet']

/** Conversations are already newest-first from the API, so each bucket stays sorted too. */
const groupedConversations = computed(() => {
  const buckets = new Map<string, ConversationItem[]>()
  for (const c of props.conversations) {
    const key = bucketFor(c)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(c)
    else buckets.set(key, [c])
  }
  return BUCKET_ORDER
    .filter((key) => buckets.has(key))
    .map((label) => ({ label, items: buckets.get(label)! }))
})
</script>

<template>
  <aside :class="cn('surface flex w-72 shrink-0 flex-col overflow-hidden', props.class)">
    <div class="space-y-2 border-b p-3">
      <Button class="min-h-11 w-full gap-1.5 md:min-h-0" @click="$emit('new')">
        <PlusIcon class="size-4" />
        New chat
      </Button>

      <LabelPicker
        kind="thread_tag"
        trigger-label="Filter by tag"
        :max="10"
        :model-value="props.filterTagIds"
        @update:model-value="(ids) => $emit('update:filterTagIds', ids)"
      />
    </div>

    <ScrollArea class="min-h-0 flex-1">
      <div class="space-y-3 p-2">
        <div v-for="group in groupedConversations" :key="group.label">
          <p class="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">
            {{ group.label }}
          </p>
          <div class="space-y-0.5">
            <div
              v-for="c in group.items"
              :key="c.id"
              class="group flex w-full items-center gap-1 rounded-xl transition-colors"
              :class="c.id === activeId ? 'bg-primary/10 ring-1 ring-primary/20' : 'hover:bg-muted'"
            >
              <button
                class="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-xl px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                @click="$emit('select', c.id)"
              >
                <span class="flex w-full items-center gap-2">
                  <Loader2Icon v-if="isStreaming(c.id)" class="size-3.5 shrink-0 animate-spin text-primary" />
                  <MessageSquareIcon v-else class="size-3.5 shrink-0 text-muted-foreground" />
                  <span class="truncate text-sm font-medium" :class="c.id === activeId ? 'text-primary' : ''">
                    {{ c.title || 'New conversation' }}
                  </span>
                </span>
                <span
                  v-if="isStreaming(c.id)"
                  class="ml-[22px] flex items-center gap-1 text-[11px] font-medium text-primary"
                >
                  <span class="relative flex size-1.5">
                    <span class="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
                    <span class="relative inline-flex size-1.5 rounded-full bg-primary" />
                  </span>
                  Batayan is replying…
                </span>
                <span v-if="c.tags?.length" class="ml-[22px] flex flex-wrap gap-1">
                  <span
                    v-for="tag in c.tags.slice(0, 3)"
                    :key="tag.id"
                    class="rounded bg-muted-foreground/10 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {{ tag.name }}
                  </span>
                  <span v-if="c.tags.length > 3" class="text-[10px] text-muted-foreground">
                    +{{ c.tags.length - 3 }}
                  </span>
                </span>
                <span
                  v-if="c.case_id && c.case_tags?.length"
                  class="ml-[22px] flex flex-wrap items-center gap-1"
                  title="Case tags"
                >
                  <span
                    v-for="tag in c.case_tags.slice(0, 3)"
                    :key="tag"
                    class="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
                  >
                    {{ tag }}
                  </span>
                  <span v-if="c.case_tags.length > 3" class="text-[10px] text-primary">
                    +{{ c.case_tags.length - 3 }}
                  </span>
                </span>
              </button>
              <button
                v-if="!isStreaming(c.id)"
                class="mr-1 shrink-0 rounded-lg p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 max-lg:opacity-100"
                title="Delete conversation"
                @click="$emit('delete', c.id)"
              >
                <TrashIcon class="size-3.5" />
              </button>
            </div>
          </div>
        </div>

        <p v-if="conversations.length === 0" class="px-3 py-8 text-center text-sm text-muted-foreground">
          No conversations yet
        </p>
      </div>
    </ScrollArea>
  </aside>
</template>
