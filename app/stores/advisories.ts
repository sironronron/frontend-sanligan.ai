import { defineStore } from 'pinia'
import { useTodoStore } from '~/stores/todos'

/** The dispositions the review dialog offers, in the order it shows them. */
export type AdvisoryStatus = 'open' | 'tracked' | 'not_a_problem' | 'will_check' | 'mitigated'

export type AdvisoryKind = 'caveat' | 'gap' | 'risk' | 'assumption' | 'deadline'

export type AdvisorySeverity = 'low' | 'medium' | 'high'

export interface Advisory {
  id: string
  conversation_id: string
  message_id: string | null
  kind: AdvisoryKind
  title: string
  detail: string | null
  severity: AdvisorySeverity
  status: AdvisoryStatus
  note: string | null
  todo_id: string | null
  responded_at: string | null
  order: number
  created_at: string
  updated_at: string
}

export const useAdvisoryStore = defineStore('advisories', () => {
  const api = useApi()

  const advisories = ref<Advisory[]>([])
  const loading = ref(false)

  /** Advisories raised on one conversation, worst first, unanswered first. */
  const severityRank: Record<AdvisorySeverity, number> = { high: 0, medium: 1, low: 2 }

  function forConversation(conversationId: string | null | undefined): Advisory[] {
    if (!conversationId) return []

    return advisories.value
      .filter((a) => a.conversation_id === conversationId)
      .sort((a, b) => {
        if ((a.status === 'open') !== (b.status === 'open')) return a.status === 'open' ? -1 : 1
        const bySeverity = severityRank[a.severity] - severityRank[b.severity]
        if (bySeverity !== 0) return bySeverity
        return a.created_at.localeCompare(b.created_at) || a.order - b.order
      })
  }

  function openCount(conversationId: string | null | undefined): number {
    return forConversation(conversationId).filter((a) => a.status === 'open').length
  }

  async function fetchAdvisories(conversationId?: string) {
    loading.value = true
    try {
      const query = conversationId ? `?conversation_id=${encodeURIComponent(conversationId)}` : ''
      const { data } = await api<{ data: Advisory[] }>(`/advisories${query}`)
      if (conversationId) {
        const others = advisories.value.filter((a) => a.conversation_id !== conversationId)
        advisories.value = [...others, ...data]
      } else {
        advisories.value = data
      }
    } catch {
      if (!conversationId) advisories.value = []
    } finally {
      loading.value = false
    }
  }

  /**
   * Record the user's answer. "tracked" also files a task server-side, so the
   * task list is pulled back down in the same breath — otherwise the new task
   * would only appear on the next page load.
   */
  async function respond(id: string, status: AdvisoryStatus, note?: string | null) {
    const { data } = await api<{ data: Advisory }>(`/advisories/${id}`, {
      method: 'PATCH',
      body: { status, ...(note === undefined ? {} : { note }) },
    })

    const index = advisories.value.findIndex((a) => a.id === id)
    if (index !== -1) advisories.value[index] = data

    if (status === 'tracked') {
      await useTodoStore().fetchTodos(data.conversation_id).catch(() => {})
    }

    return data
  }

  async function dismiss(id: string) {
    await api(`/advisories/${id}`, { method: 'DELETE' })
    advisories.value = advisories.value.filter((a) => a.id !== id)
  }

  return {
    advisories,
    loading,
    forConversation,
    openCount,
    fetchAdvisories,
    respond,
    dismiss,
  }
})
