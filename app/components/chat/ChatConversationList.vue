<script setup lang="ts">
import { MessageSquareIcon, PlusIcon, TrashIcon } from '@lucide/vue'

export interface ConversationItem {
  id: string
  title: string | null
  last_message_at: string | null
  updated_at?: string | null
}

defineProps<{
  conversations: ConversationItem[]
  activeId: string | null
  busy?: boolean
}>()

defineEmits<{
  new: []
  select: [id: string]
  delete: [id: string]
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
  <aside class="flex w-72 shrink-0 flex-col border-r bg-muted/30">
    <div class="border-b p-3">
      <Button class="w-full gap-1.5" :disabled="busy" @click="$emit('new')">
        <PlusIcon class="size-4" />
        New chat
      </Button>
    </div>

    <ScrollArea class="flex-1">
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
          </button>
          <button
            class="mr-1 shrink-0 rounded-lg p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
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
