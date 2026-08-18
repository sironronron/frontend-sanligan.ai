import type { Ref } from 'vue'

export interface Subtask {
  id: string
  todo_id: string
  title: string
  done: boolean
  order: number
  created_at: string
  updated_at: string
}

export interface TaskComment {
  id: string
  todo_id: string
  user_id: string
  body: string
  created_at: string
  updated_at: string
  user?: { id: string; name: string; email: string }
}

export interface TaskActivity {
  id: string
  todo_id: string
  user_id: string
  type: string
  description: string
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  user?: { id: string; name: string; email: string }
}

export interface TaskAttachment {
  id: string
  todo_id: string
  document_id: string
  created_at: string
  updated_at: string
  document?: { id: string; original_filename: string; mime_type: string; status: string }
}

/**
 * Composable that manages subtasks, comments, activities, and attachments
 * for a single todo. Each instance is scoped to one todo ID.
 */
export function useTaskResources(todoId: MaybeRefOrGetter<string>) {
  const api = useApi()

  const subtasks = ref<Subtask[]>([])
  const comments = ref<TaskComment[]>([])
  const activities = ref<TaskActivity[]>([])
  const attachments = ref<TaskAttachment[]>([])
  const loading = ref(false)

  const subtaskProgress = computed(() => {
    if (subtasks.value.length === 0) return 0
    const done = subtasks.value.filter(s => s.done).length
    return Math.round((done / subtasks.value.length) * 100)
  })

  // --- Subtasks ---
  async function fetchSubtasks() {
    const id = toValue(todoId)
    try {
      const { data } = await api<{ data: Subtask[] }>(`/todos/${id}/subtasks`)
      subtasks.value = data
    } catch { subtasks.value = [] }
  }

  async function addSubtask(title: string): Promise<Subtask | null> {
    const id = toValue(todoId)
    try {
      const { data } = await api<{ data: Subtask }>(`/todos/${id}/subtasks`, {
        method: 'POST',
        body: { title },
      })
      subtasks.value.push(data)
      return data
    } catch { return null }
  }

  async function updateSubtask(subtaskId: string, payload: Partial<Pick<Subtask, 'title' | 'done' | 'order'>>) {
    const id = toValue(todoId)
    try {
      const { data } = await api<{ data: Subtask }>(`/todos/${id}/subtasks/${subtaskId}`, {
        method: 'PATCH',
        body: payload,
      })
      const idx = subtasks.value.findIndex(s => s.id === subtaskId)
      if (idx !== -1) subtasks.value[idx] = data
      return data
    } catch { return null }
  }

  async function removeSubtask(subtaskId: string) {
    const id = toValue(todoId)
    try {
      await api(`/todos/${id}/subtasks/${subtaskId}`, { method: 'DELETE' })
      subtasks.value = subtasks.value.filter(s => s.id !== subtaskId)
    } catch { /* noop */ }
  }

  // --- Comments ---
  async function fetchComments() {
    const id = toValue(todoId)
    try {
      const { data } = await api<{ data: TaskComment[] }>(`/todos/${id}/comments`)
      comments.value = data
    } catch { comments.value = [] }
  }

  async function addComment(body: string): Promise<TaskComment | null> {
    const id = toValue(todoId)
    try {
      const { data } = await api<{ data: TaskComment }>(`/todos/${id}/comments`, {
        method: 'POST',
        body: { body },
      })
      comments.value.unshift(data)
      return data
    } catch { return null }
  }

  async function removeComment(commentId: string) {
    const id = toValue(todoId)
    try {
      await api(`/todos/${id}/comments/${commentId}`, { method: 'DELETE' })
      comments.value = comments.value.filter(c => c.id !== commentId)
    } catch { /* noop */ }
  }

  // --- Activities ---
  async function fetchActivities() {
    const id = toValue(todoId)
    try {
      const { data } = await api<{ data: TaskActivity[] }>(`/todos/${id}/activities`)
      activities.value = data
    } catch { activities.value = [] }
  }

  // --- Attachments ---
  async function fetchAttachments() {
    const id = toValue(todoId)
    try {
      const { data } = await api<{ data: TaskAttachment[] }>(`/todos/${id}/attachments`)
      attachments.value = data
    } catch { attachments.value = [] }
  }

  async function addAttachment(documentId: string): Promise<TaskAttachment | null> {
    const id = toValue(todoId)
    try {
      const { data } = await api<{ data: TaskAttachment }>(`/todos/${id}/attachments`, {
        method: 'POST',
        body: { document_id: documentId },
      })
      attachments.value.push(data)
      return data
    } catch { return null }
  }

  async function removeAttachment(attachmentId: string) {
    const id = toValue(todoId)
    try {
      await api(`/todos/${id}/attachments/${attachmentId}`, { method: 'DELETE' })
      attachments.value = attachments.value.filter(a => a.id !== attachmentId)
    } catch { /* noop */ }
  }

  // --- Fetch all ---
  async function fetchAll() {
    loading.value = true
    await Promise.all([
      fetchSubtasks(),
      fetchComments(),
      fetchActivities(),
      fetchAttachments(),
    ])
    loading.value = false
  }

  return {
    subtasks: readonly(subtasks),
    comments: readonly(comments),
    activities: readonly(activities),
    attachments: readonly(attachments),
    loading: readonly(loading),
    subtaskProgress,
    fetchSubtasks,
    addSubtask,
    updateSubtask,
    removeSubtask,
    fetchComments,
    addComment,
    removeComment,
    fetchActivities,
    fetchAttachments,
    addAttachment,
    removeAttachment,
    fetchAll,
  }
}
