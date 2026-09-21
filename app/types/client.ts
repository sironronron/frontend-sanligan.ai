export type ClientType = 'person' | 'organization'
export type ClientLifecycle = 'prospect' | 'active' | 'former'

export interface ClientContact {
  email?: string | null
  phone?: string | null
}

export interface ClientCapabilities {
  update?: boolean
  archive?: boolean
  restore?: boolean
}

export interface Client {
  id: string
  client_type: ClientType
  display_name: string
  lifecycle: ClientLifecycle
  organization_id: string | null
  owner_id: string
  owner?: { id: string; name: string; email?: string | null } | null
  contact: ClientContact
  notes: string | null
  archived_at: string | null
  pipeline_items_count?: number
  linked_cases_count?: number
  capabilities?: ClientCapabilities
  created_at: string
  updated_at: string
  pipeline_items?: Array<{ id: string; title: string; pipeline?: { name: string } | null; stage?: { name: string } | null; updated_at: string }>
  linked_cases?: Array<{ case_id: string; relationship_type: 'primary_client' | 'additional_client'; relationship_label: string; case?: { id: string; title: string; reference?: string | null; status?: string; archived_at?: string | null } | null }>
}

export interface ClientInput {
  client_type: ClientType
  display_name: string
  lifecycle?: ClientLifecycle
  contact?: ClientContact
  notes?: string | null
}

export interface ClientFilters {
  q?: string
  client_type?: ClientType
  lifecycle?: ClientLifecycle
  owner_id?: string
  archived?: boolean
  page?: number
  per_page?: number
}

export interface ClientPagination {
  current_page: number
  last_page: number
  per_page: number
  total: number
}
