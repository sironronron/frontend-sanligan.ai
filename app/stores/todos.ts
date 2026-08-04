import { defineStore } from 'pinia'

export interface Todo {
  id: string
  conversation_id: string
  title: string
  status: 'pending' | 'on-going' | 'completed'
  priority: 'low' | 'medium' | 'high' | null
  due_hint: string | null
  created_at: string
  updated_at: string
}

export const useTodoStore = defineStore('todos', () => {
  const api = useApi()

  const todos = ref<Todo[]>([])
  const loading = ref(false)

  async function fetchTodos(conversationId?: string) {
    loading.value = true
    try {
      const params = new URLSearchParams()
      if (conversationId) {
        params.append('conversation_id', conversationId)
      }
      const query = params.toString() ? `?${params.toString()}` : ''
      const { data } = await api<{ data: Todo[] }>(`/todos${query}`)
      todos.value = data
    } catch {
      todos.value = []
    } finally {
      loading.value = false
    }
  }

  async function addTodos(items: Array<{ title: string; status?: string; priority?: string; due_hint?: string }>, conversationId: string) {
    for (const item of items) {
      const { data } = await api<{ data: Todo }>('/todos', {
        method: 'POST',
        body: {
          conversation_id: conversationId,
          title: item.title,
          status: item.status ?? 'pending',
          priority: item.priority ?? null,
          due_hint: item.due_hint ?? null,
        },
      })
      todos.value.unshift(data)
    }
  }

  async function toggleStatus(id: string) {
    const todo = todos.value.find((t) => t.id === id)
    if (!todo) return

    const nextStatus = todo.status === 'completed' ? 'pending' : todo.status === 'pending' ? 'on-going' : 'completed'

    const { data } = await api<{ data: Todo }>(`/todos/${id}`, {
      method: 'PATCH',
      body: { status: nextStatus },
    })

    Object.assign(todo, data)
  }

  async function deleteTodo(id: string) {
    await api(`/todos/${id}`, { method: 'DELETE' })
    todos.value = todos.value.filter((t) => t.id !== id)
  }

  return {
    todos,
    loading,
    fetchTodos,
    addTodos,
    toggleStatus,
    deleteTodo,
  }
})
