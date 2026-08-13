import { defineStore } from 'pinia'

export interface AppNotification {
  id: string
  type: string
  read: boolean
  read_at: string | null
  created_at: string
  kind: 'case' | 'task'
  title: string
  due_date: string | null
  days: number
  overdue: boolean
  url: string
}

export const useNotificationStore = defineStore('notifications', () => {
  const api = useApi()

  const notifications = ref<AppNotification[]>([])
  const unreadCount = ref(0)
  const loading = ref(false)

  async function fetchNotifications() {
    loading.value = true
    try {
      const res = await api<{ data: AppNotification[]; unread_count: number }>('/notifications')
      notifications.value = res.data
      unreadCount.value = res.unread_count
    } catch {
      notifications.value = []
    } finally {
      loading.value = false
    }
  }

  async function fetchUnreadCount() {
    try {
      const res = await api<{ unread_count: number }>('/notifications/unread-count')
      unreadCount.value = res.unread_count
    } catch {
      // Keep the last known value; the badge is refreshed on every bell open anyway.
    }
  }

  async function markRead(id: string) {
    const notification = notifications.value.find((n) => n.id === id)
    if (!notification || notification.read) return

    notifications.value = notifications.value.map((n) =>
      n.id === id ? { ...n, read: true, read_at: new Date().toISOString() } : n
    )
    if (unreadCount.value > 0) unreadCount.value--

    try {
      await api(`/notifications/${id}`, { method: 'PATCH', body: { read: true } })
    } catch {
      // Optimistic: the server reconciles on the next full fetch.
    }
  }

  async function markAllRead() {
    if (unreadCount.value === 0 && notifications.value.every((n) => n.read)) return

    notifications.value = notifications.value.map((n) =>
      n.read ? n : { ...n, read: true, read_at: new Date().toISOString() }
    )
    unreadCount.value = 0

    try {
      await api('/notifications/read-all', { method: 'POST' })
    } catch {
      // Optimistic: same reconciliation story as markRead.
    }
  }

  async function remove(id: string) {
    notifications.value = notifications.value.filter((n) => n.id !== id)

    try {
      await api(`/notifications/${id}`, { method: 'DELETE' })
    } catch {
      // Ignore; the feed reloads from the server next time.
    }
  }

  return {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    fetchUnreadCount,
    markRead,
    markAllRead,
    remove,
  }
})