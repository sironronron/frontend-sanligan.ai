import { defineStore } from 'pinia'
import type { Client, ClientFilters, ClientInput, ClientPagination } from '~/types/client'
import { buildClientQuery } from '~/utils/clientQuery'

function idempotencyKey() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `crm-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const useClientStore = defineStore('clients', () => {
  const api = useApi()
  const clients = ref<Client[]>([])
  const current = ref<Client | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<unknown>(null)
  const etags = reactive<Record<string, string>>({})
  const pagination = ref<ClientPagination>({ current_page: 1, last_page: 1, per_page: 25, total: 0 })

  function remember(id: string, response: unknown) {
    const tag = (response as { headers?: { get?: (key: string) => string | null } } | undefined)?.headers?.get?.('etag')
    if (tag) etags[id] = tag
  }

  function mutationOptions(id: string, body?: unknown, method: 'PATCH' | 'POST' | 'DELETE' = 'PATCH') {
    return {
      method,
      body,
      headers: { 'Idempotency-Key': idempotencyKey(), ...(etags[id] ? { 'If-Match': etags[id] } : {}) },
      onResponse: ({ response }: { response: Response }) => remember(id, response),
    }
  }

  async function fetchClients(filters: ClientFilters = {}) {
    loading.value = true
    error.value = null
    try {
      const query = buildClientQuery(filters)
      const response = await api<{ data: Client[]; meta?: Partial<ClientPagination> }>(`/clients${query ? `?${query}` : ''}`)
      clients.value = response.data
      pagination.value = { ...pagination.value, ...response.meta, total: response.meta?.total ?? response.data.length }
    } catch (cause) {
      error.value = cause
      clients.value = []
      throw cause
    } finally {
      loading.value = false
    }
  }

  async function fetchClient(id: string, options: { archived?: boolean } = {}) {
    const query = options.archived === true ? '?archived=1' : ''
    const { data } = await api<{ data: Client }>(`/clients/${encodeURIComponent(id)}${query}`, { onResponse: ({ response }: { response: Response }) => remember(id, response) })
    current.value = data
    return data
  }

  async function createClient(payload: ClientInput) {
    saving.value = true
    try {
      const { data } = await api<{ data: Client }>('/clients', mutationOptions(idempotencyKey(), payload, 'POST'))
      clients.value = [data, ...clients.value]
      return data
    } finally { saving.value = false }
  }

  async function updateClient(id: string, payload: Partial<ClientInput>) {
    saving.value = true
    try {
      const { data } = await api<{ data: Client }>(`/clients/${encodeURIComponent(id)}`, mutationOptions(id, payload))
      current.value = data
      const index = clients.value.findIndex((client) => client.id === id)
      if (index !== -1) clients.value[index] = data
      return data
    } finally { saving.value = false }
  }

  async function archiveClient(id: string) {
    const { data } = await api<{ data: Client }>(`/clients/${encodeURIComponent(id)}`, mutationOptions(id, undefined, 'DELETE'))
    current.value = data
    return data
  }

  async function restoreClient(id: string) {
    const { data } = await api<{ data: Client }>(`/clients/${encodeURIComponent(id)}/restore`, mutationOptions(id, undefined, 'POST'))
    current.value = data
    return data
  }

  async function attachCase(id: string, caseId: string, relationshipType: 'primary_client' | 'additional_client') {
    saving.value = true
    try {
      const { data } = await api<{ data: Client }>(`/clients/${encodeURIComponent(id)}/cases`, mutationOptions(id, { case_id: caseId, relationship_type: relationshipType, is_primary: relationshipType === 'primary_client' }, 'POST'))
      current.value = data
      return data
    } finally { saving.value = false }
  }

  async function detachCase(id: string, caseId: string, replacementClientId?: string) {
    saving.value = true
    try {
      const { data } = await api<{ data: Client }>(`/clients/${encodeURIComponent(id)}/cases/${encodeURIComponent(caseId)}`, mutationOptions(id, replacementClientId ? { replacement_client_id: replacementClientId } : undefined, 'DELETE'))
      current.value = data
      return data
    } finally { saving.value = false }
  }

  return { clients, current, loading, saving, error, pagination, fetchClients, fetchClient, createClient, updateClient, archiveClient, restoreClient, attachCase, detachCase }
})
