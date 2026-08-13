<script setup lang="ts">
import { MessageSquareIcon, PlusIcon, TrashIcon } from '@lucide/vue'
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
  busy?: boolean
  /** Tag ids the list is currently filtered by. */
  filterTagIds?: string[]
  class?: string
}>(), { class: '', filterTagIds: () => [] })

defineEmits<{
  new: []
  select: [id: string]
  delete: [id: string]
  'update:filterTagIds': [ids: string[]]
}>()

function timeLabel(conversation: ConversationItem): string {
  const date = conversation.last_message_at ?? conversation.updated_at
  if (!date) return 'No messages yet'

  const then = new Date(date)
  if (Number.isNaN(then.getTime())) return ''

  const diffMs = Date.now() - then.getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`

  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
</script>

<template>
    <aside :class="cn('flex w-72 shrink-0 flex-col border-r bg-muted/30', props.class)">
    <div class="space-y-2 border-b p-3">
      <Button class="w-full gap-1.5" :disabled="busy" @click="$emit('new')">
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
      <div class="space-y-1 p-2">
        <div
          v-for="c in conversations"
          :key="c.id"
          class="group flex w-full items-center gap-1 rounded-xl transition-colors"
          :class="c.id === activeId ? 'bg-primary/10 ring-1 ring-primary/20' : 'hover:bg-muted'"
        >
          <button
            class="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-xl px-3 py-2.5 text-left"
            @click="$emit('select', c.id)"
          >
            <span class="flex w-full items-center gap-2">
              <MessageSquareIcon class="size-3.5 shrink-0 text-muted-foreground" />
              <span class="truncate text-sm font-medium" :class="c.id === activeId ? 'text-primary' : ''">
                {{ c.title || 'New conversation' }}
              </span>
            </span>
            <span class="ml-[22px] text-[11px] text-muted-foreground/80">
              {{ timeLabel(c) }}
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
            class="mr-1 shrink-0 rounded-lg p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 max-lg:opacity-100"
            title="Delete conversation"
            @click="$emit('delete', c.id)"
          >
            <TrashIcon class="size-3.5" />
          </button>
        </div>

        <p v-if="conversations.length === 0" class="px-3 py-8 text-center text-sm text-muted-foreground">
          No conversations yet
        </p>
      </div>
    </ScrollArea>
  </aside>
</template>
