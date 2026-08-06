import { defineStore } from 'pinia'

export interface CaseConversation {
  id: string
  case_id: string | null
  title: string | null
  purpose: string | null
  messages_count: number
  last_message_at: string | null
  created_at: string
  updated_at: string
}

export interface LegalCase {
  id: string
  title: string
  case_type: string
  reference: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'open' | 'in_progress' | 'on_hold' | 'closed'
  description: string | null
  related_parties: string[]
  due_date: string | null
  tags: string[]
  default_template_id: string | null
  default_template?: {
    id: string
    name: string
    category: string
  } | null
  conversation_id: string | null
  active_conversation_id: string | null
  conversations: CaseConversation[]
  messages_count: number
  open_tasks_count: number
  total_tasks_count: number
  last_message_at: string | null
  last_message_snippet: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
  messages?: Array<{
    id: string
    role: 'user' | 'assistant'
    content: string
    provider?: string | null
    sources: unknown[]
    created_at: string
  }>
  tasks?: Array<{
    id: string
    title: string
    description: string | null
    status: 'pending' | 'on-going' | 'completed'
    priority: 'low' | 'medium' | 'high' | null
    due_hint: string | null
    due_date: string | null
    assignee: string | null
    order: number
    created_at: string
    updated_at: string
  }>
}

export interface CaseFilters {
  search?: string
  status?: string
  case_type?: string
  priority?: string
  tag?: string
  archived?: boolean
}

export interface CaseIntake {
  title: string
  case_type: string
  reference?: string | null
  priority?: string | null
  status: string
  description?: string | null
  related_parties?: string[]
  due_date?: string | null
  tags?: string[]
  default_template_id?: string | null
}

export const CASE_TYPES = [
  { value: 'legal', label: 'Legal' },
  { value: 'hr', label: 'HR' },
  { value: 'customer_support', label: 'Customer Support' },
  { value: 'administrative', label: 'Administrative' },
  { value: 'general', label: 'General' },
]

export const CASE_STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'closed', label: 'Closed' },
]

export const CASE_PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

export const useCaseStore = defineStore('cases', () => {
  const api = useApi()

  const cases = ref<LegalCase[]>([])
  const loading = ref(false)
  const current = ref<LegalCase | null>(null)

  async function fetchCases(filters: CaseFilters = {}) {
    loading.value = true
    try {
      const params = new URLSearchParams()
      if (filters.search) params.append('search', filters.search)
      if (filters.status) params.append('status', filters.status)
      if (filters.case_type) params.append('case_type', filters.case_type)
      if (filters.priority) params.append('priority', filters.priority)
      if (filters.tag) params.append('tag', filters.tag)
      if (filters.archived) params.append('archived', '1')
      const query = params.toString() ? `?${params.toString()}` : ''
      const { data } = await api<{ data: LegalCase[] }>(`/cases${query}`)
      cases.value = data
    } catch {
      cases.value = []
    } finally {
      loading.value = false
    }
  }

  async function fetchCase(id: string, conversationId?: string | null) {
    const query = conversationId ? `?conversation=${encodeURIComponent(conversationId)}` : ''
    const { data } = await api<{ data: LegalCase }>(`/cases/${id}${query}`)
    current.value = data
    return data
  }

  async function createConversation(caseId: string, payload: { purpose?: string; title?: string }) {
    const { data } = await api<{ data: CaseConversation }>(`/cases/${caseId}/conversations`, {
      method: 'POST',
      body: payload,
    })
    return data
  }

  async function createCase(payload: CaseIntake) {
    const { data } = await api<{ data: LegalCase }>('/cases', {
      method: 'POST',
      body: payload,
    })
    return data
  }

  async function updateCase(id: string, payload: Partial<CaseIntake>) {
    const { data } = await api<{ data: LegalCase }>(`/cases/${id}`, {
      method: 'PATCH',
      body: payload,
    })
    if (current.value?.id === id) {
      current.value = { ...current.value, ...data }
    }
    const index = cases.value.findIndex((c) => c.id === id)
    if (index !== -1) cases.value[index] = { ...cases.value[index], ...data }
    return data
  }

  async function duplicateCase(id: string) {
    const { data } = await api<{ data: LegalCase }>(`/cases/${id}/duplicate`, {
      method: 'POST',
    })
    return data
  }

  async function archiveCase(id: string) {
    await api(`/cases/${id}`, { method: 'DELETE' })
  }

  async function restoreCase(id: string) {
    const { data } = await api<{ data: LegalCase }>(`/cases/${id}/restore`, {
      method: 'POST',
    })
    return data
  }

  async function forceDeleteCase(id: string, confirmation: string) {
    await api(`/cases/${id}/force`, {
      method: 'DELETE',
      body: { confirmation },
    })
  }

  return {
    cases,
    loading,
    current,
    fetchCases,
    fetchCase,
    createConversation,
    createCase,
    updateCase,
    duplicateCase,
    archiveCase,
    restoreCase,
    forceDeleteCase,
  }
})
