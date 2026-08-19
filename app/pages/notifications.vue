<script setup lang="ts">
import { BellIcon, CheckCheckIcon, TrashIcon } from '@lucide/vue'
import { useNotificationStore } from '~/stores/notifications'
import { timeAgo } from '~/utils/time'

definePageMeta({
  middleware: ['auth'],
})

const notificationStore = useNotificationStore()

const kindLabel: Record<string, string> = {
  case: 'Case',
  task: 'Task',
  task_assigned: 'Assignment',
  task_comment: 'Comment',
  vetting_request: 'Vetting request',
  vetting_message: 'Message',
  lawyer_verification: 'Verification',
  payout: 'Payout',
}

function dueLabel(days: number, overdue: boolean) {
  if (overdue) return 'Overdue'
  if (days === 0) return 'Due today'
  return `Due in ${days} ${days === 1 ? 'day' : 'days'}`
}

/**
 * Case and task reminders carry a due date; the vetting/payout notifications
 * are informational and have no countdown, so they just get the timestamp.
 */
function metaLabel(n: { kind: string, days: number, overdue: boolean }) {
  if (n.kind === 'case' || n.kind === 'task') return dueLabel(n.days, n.overdue)
  return ''
}

onMounted(() => {
  void notificationStore.fetchNotifications()
})
</script>

<template>
  <div class="mx-auto w-full max-w-3xl px-4 py-6">
    <PageHeader title="Notifications" description="Deadline reminders for your cases and tasks.">
      <template #actions>
        <Button
          variant="outline"
          class="gap-2"
          :disabled="notificationStore.unreadCount === 0"
          @click="notificationStore.markAllRead()"
        >
          <CheckCheckIcon class="size-4" />
          Mark all as read
        </Button>
      </template>
    </PageHeader>

    <ListSkeleton v-if="notificationStore.loading" :rows="4" :icon="false" />

    <EmptyState
      v-else-if="notificationStore.notifications.length === 0"
      :icon="BellIcon"
      title="No notifications yet"
      description="Deadline reminders show up here when a case or task is coming due."
    />

    <div v-else class="space-y-2">
      <div
        v-for="n in notificationStore.notifications"
        :key="n.id"
        class="surface-interactive group flex items-start gap-3 p-4"
        :class="n.read ? 'opacity-70' : ''"
      >
        <NuxtLink :to="n.url" class="min-w-0 flex-1" @click="notificationStore.markRead(n.id)">
          <div class="flex items-center gap-2">
            <span class="mt-1.5 size-2 shrink-0 rounded-full" :class="n.read ? 'bg-muted-foreground/30' : 'bg-primary'" />
            <p class="text-sm font-medium leading-tight">{{ n.title }}</p>
          </div>
          <div class="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <Badge
              v-if="metaLabel(n) !== ''"
              :class="n.overdue ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'"
              class="text-[10px]"
            >
              {{ metaLabel(n) }}
            </Badge>
            <span>{{ kindLabel[n.kind] ?? '' }}</span>
            <span>{{ timeAgo(n.created_at) }}</span>
          </div>
        </NuxtLink>

        <button
          type="button"
          :aria-label="`Delete notification: ${n.title}`"
          class="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 group-hover:opacity-100"
          @click="notificationStore.remove(n.id)"
        >
          <TrashIcon class="size-4" />
        </button>
      </div>
    </div>
  </div>
</template>