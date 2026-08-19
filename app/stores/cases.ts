import { defineStore } from 'pinia'

export interface CaseConversation {
  id: string
  case_id: string | null
  title: string | null
  purpose: string | null
  messages_count: number
  last_message_at: string | null
  tags?: Array<{ id: string; name: string; slug: string; color?: string | null }>
  /** When the thread was pinned, so pinned threads lead the list. */
  pinned_at: string | null
  created_at: string
  updated_at: string
}

/**
 * A person shown against a case: its owner, an assignee, or a candidate in the
 * assign picker. Deliberately thin — the API sends only what naming a
 * colleague and drawing their avatar needs.
 */
export interface CaseMember {
  id: string
  name: string
  email: string
  org_role: string | null
  org_status: string | null
}

export interface LegalCase {
  id: string
  title: string
  owner_id: string
  organization_id: string | null
  owner?: CaseMember | null
  assignees?: CaseMember[]
  /** Whether the signed-in user owns this case, rather than being assigned to it. */
  is_owner: boolean
  /** Whether they may change who else is on it — the owner, or an org admin. */
  can_manage_assignees: boolean
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
  closed_at: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
  messages?: Array<{
    id: string
    role: 'user' | 'assistant'
    content: string
    provider?: string | null
    sources: unknown[]
    template_id?: string | null
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

export interface CaseProgressEvent {
  type:
    | 'case_created'
    | 'thread_created'
    | 'document_uploaded'
    | 'document_generated'
    | 'task_created'
    | 'task_completed'
    | 'memory_recorded'
    | 'message_sent'
    | 'message_received'
    | 'case_archived'
  at: string
  title: string
  description: string | null
  meta: Record<string, string | null>
}

export interface CaseProgress {
  case: Pick<
    LegalCase,
    | 'id'
    | 'title'
    | 'reference'
    | 'case_type'
    | 'status'
    | 'priority'
    | 'description'
    | 'related_parties'
    | 'tags'
    | 'due_date'
    | 'archived_at'
    | 'created_at'
    | 'updated_at'
  >
  stages: Array<{ key: string; label: string; state: 'done' | 'active' | 'pending' }>
  progress: { percent: number; basis: 'tasks' | 'status'; label: string }
  deadline: { due_date: string; days_remaining: number; overdue: boolean } | null
  stats: {
    days_open: number
    threads: number
    messages: number
    user_messages: number
    assistant_messages: number
    documents: { total: number; ready: number; processing: number; failed: number }
    generated_documents: number
    tasks: { total: number; completed: number; in_progress: number; pending: number; overdue: number }
    key_facts: number
    last_activity_at: string | null
  }
  threads: Array<{
    id: string
    label: string
    messages_count: number
    first_message_at: string | null
    last_message_at: string | null
    total_tasks: number
    open_tasks: number
    created_at: string | null
  }>
  tasks: Array<{
    id: string
    title: string
    status: 'pending' | 'on-going' | 'completed'
    priority: 'low' | 'medium' | 'high' | null
    due_hint: string | null
    due_date: string | null
    overdue: boolean
    thread: string | null
    conversation_id: string
    created_at: string | null
    updated_at: string | null
  }>
  documents: Array<{
    id: string
    title: string
    original_filename: string
    status: 'queued' | 'processing' | 'ready' | 'failed'
    created_at: string | null
  }>
  generated_documents: Array<{
    id: string
    title: string
    thread: string | null
    conversation_id: string
    created_at: string | null
  }>
  key_facts: Record<'fact' | 'preference' | 'deadline' | 'strategy', Array<{ id: string; content: string; created_at: string | null }>>
  timeline: CaseProgressEvent[]
  timeline_truncated: boolean
}

export interface CaseFilters {
  search?: string
  status?: string
  case_type?: string
  priority?: string
  tag?: string
  /** A colleague's id, or 'me' — matches cases they own or are assigned to. */
  assignee?: string
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
      if (filters.assignee) params.append('assignee', filters.assignee)
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

  async function fetchCaseProgress(id: string) {
    const { data } = await api<{ data: CaseProgress }>(`/cases/${id}/progress`)
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

  /**
   * Move a case between statuses on its own. The full update needs every
   * required intake field, which a one-click status switch has no business
   * resending.
   */
  async function updateCaseStatus(id: string, status: LegalCase['status']) {
    const { data } = await api<{ data: LegalCase }>(`/cases/${id}/status`, {
      method: 'PATCH',
      body: { status },
    })
    if (current.value?.id === id) {
      current.value = { ...current.value, status: data.status }
    }
    const index = cases.value.findIndex((c) => c.id === id)
    if (index !== -1) cases.value[index] = { ...cases.value[index]!, status: data.status }
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

  /**
   * The people on a case. Kept off the case record itself because the picker
   * refetches it after every change, and the case payload is heavy.
   */
  async function fetchAssignees(caseId: string) {
    return await api<{ owner: CaseMember; assignees: CaseMember[]; can_manage: boolean }>(
      `/cases/${caseId}/assignees`,
    )
  }

  /** Colleagues who could be added: active org members not already on the case. */
  async function fetchAssignableMembers(caseId: string) {
    const { data } = await api<{ data: CaseMember[] }>(`/cases/${caseId}/assignees/candidates`)
    return data
  }

  /**
   * Add someone by id, or by email when they are not in the organization yet —
   * the API decides whether that email is an existing colleague or an invite,
   * so the caller does not have to know which.
   */
  async function assignMember(caseId: string, target: { user_id: string } | { email: string }) {
    const response = await api<{ assignees: CaseMember[]; invitation?: { email: string } }>(
      `/cases/${caseId}/assignees`,
      { method: 'POST', body: target },
    )
    applyAssignees(caseId, response.assignees)
    return response
  }

  async function unassignMember(caseId: string, userId: string) {
    const response = await api<{ assignees: CaseMember[] }>(`/cases/${caseId}/assignees/${userId}`, {
      method: 'DELETE',
    })
    applyAssignees(caseId, response.assignees)
    return response
  }

  /** Keep the open case and the list row in step with a membership change. */
  function applyAssignees(caseId: string, assignees: CaseMember[]) {
    if (current.value?.id === caseId) {
      current.value = { ...current.value, assignees }
    }

    const index = cases.value.findIndex((c) => c.id === caseId)
    if (index !== -1) cases.value[index] = { ...cases.value[index]!, assignees }
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
    fetchCaseProgress,
    createConversation,
    createCase,
    updateCase,
    updateCaseStatus,
    duplicateCase,
    archiveCase,
    restoreCase,
    forceDeleteCase,
    fetchAssignees,
    fetchAssignableMembers,
    assignMember,
    unassignMember,
  }
})
