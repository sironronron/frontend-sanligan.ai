<script setup lang="ts">
import { BellIcon, Loader2Icon } from '@lucide/vue'
import { useNotificationStore, type AppNotification } from '~/stores/notifications'
import { timeAgo } from '~/utils/time'

withDefaults(defineProps<{ class?: string }>(), { class: '' })

const notificationStore = useNotificationStore()
const router = useRouter()

const open = ref(false)

const recent = computed(() => notificationStore.notifications.slice(0, 8))

function deadlineLabel(n: AppNotification) {
  if (n.overdue) {
    const days = Math.abs(n.days)
    return `${days} ${days === 1 ? 'day' : 'days'} overdue`
  }
  if (n.days === 0) return 'Due today'
  return `Due in ${n.days} ${n.days === 1 ? 'day' : 'days'}`
}

async function openNotification(n: AppNotification) {
  void notificationStore.markRead(n.id)
  await router.push(n.url)
}

watch(open, (isOpen) => {
  if (isOpen) {
    void notificationStore.fetchNotifications()
  }
})

let interval: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  void notificationStore.fetchUnreadCount()
  interval = setInterval(() => void notificationStore.fetchUnreadCount(), 60_000)
})

onBeforeUnmount(() => {
  if (interval) clearInterval(interval)
})
</script>

<template>
  <div :class="class">
    <DropdownMenu v-model:open="open">
      <DropdownMenuTrigger
        aria-label="Notifications"
        class="relative flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <BellIcon class="size-4" />
        <span
          v-if="notificationStore.unreadCount > 0"
          class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold leading-none text-white"
        >
          {{ notificationStore.unreadCount > 9 ? '9+' : notificationStore.unreadCount }}
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" class="w-80">
        <DropdownMenuLabel class="flex items-center justify-between">
          <span class="text-sm font-medium">Notifications</span>
          <button
            v-if="notificationStore.unreadCount > 0"
            type="button"
            class="text-xs text-primary hover:underline"
            @click="notificationStore.markAllRead()"
          >
            Mark all read
          </button>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <div v-if="notificationStore.loading" class="flex items-center justify-center py-8">
          <Loader2Icon class="size-5 animate-spin text-muted-foreground" />
        </div>

        <div v-else-if="recent.length === 0" class="px-3 py-8 text-center">
          <p class="text-xs text-muted-foreground">No notifications yet</p>
        </div>

        <template v-else>
          <div
            v-for="n in recent"
            :key="n.id"
            class="group flex items-start gap-2 rounded-md px-3 py-1.5 transition-colors hover:bg-muted/50"
          >
            <button class="min-w-0 flex-1 text-left" @click="openNotification(n)">
              <p class="text-sm leading-tight" :class="n.read ? 'text-muted-foreground' : 'font-medium text-foreground'">
                {{ n.title }}
              </p>
              <p class="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Badge
                  v-if="n.kind === 'case' || n.kind === 'task'"
                  :class="n.overdue ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'"
                  class="px-1.5 py-0 text-[10px]"
                >
                  {{ deadlineLabel(n) }}
                </Badge>
                <span>{{ timeAgo(n.created_at) }}</span>
              </p>
            </button>
          </div>
        </template>

        <DropdownMenuSeparator />
        <DropdownMenuItem @click="navigateTo('/notifications')">
          View all notifications
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>