import { defineStore } from 'pinia'
import type { ApiResource } from '~/composables/useApi'

export type IntegrationProviderKey = 'google_workspace' | 'sharepoint'

export type IntegrationStatus = 'connected' | 'needs_reauthorization' | 'paused'

export type SyncMode = 'webhook' | 'scheduled' | 'on_demand'

export type CapabilityPolicy = 'forced_on' | 'forced_off' | null

/**
 * One capability's definition (copy + the scopes it needs) merged with the
 * state the connection currently holds for it.
 */
export interface IntegrationCapability {
  key: string
  label: string
  description: string
  /** What data the capability can touch — shown in the pre-connect disclosure. */
  data_access: string
  sync_mode: SyncMode
  state: {
    enabled: boolean
    enabled_at: string | null
    last_synced_at: string | null
    sync_status: 'idle' | 'syncing' | 'error'
    last_error: string | null
    /** The stored toggle once the org's forced-on/forced-off policy is applied. */
    effectively_enabled: boolean
    policy: CapabilityPolicy
  }
}

export interface IntegrationConnection {
  id: string
  status: IntegrationStatus
  account_email: string | null
  account_name: string | null
  connection_scope: 'personal' | 'firm_wide'
  connected_at: string | null
  last_synced_at: string | null
  paused_reason: string | null
  /** Whether the signed-in user may toggle/disconnect this connection. */
  can_manage: boolean
}

export interface IntegrationProvider {
  provider: IntegrationProviderKey
  name: string
  description: string
  capabilities: IntegrationCapability[]
  connection: IntegrationConnection | null
}

export interface IntegrationsAdmin {
  is_manager: boolean
  connection_mode: 'per_seat' | 'firm_wide'
  policies: Record<string, 'forced_on' | 'forced_off'>
}

export interface IntegrationsPayload {
  /** Whether the current plan carries add-ons. The cards render either way. */
  eligible: boolean
  upgrade_message: string | null
  providers: IntegrationProvider[]
  admin: IntegrationsAdmin | null
}

export interface ConnectResponse {
  authorize_url: string
  privacy_summary: { key: string; label: string; data_access: string }[]
}

export interface ToggleResponse {
  enabled: boolean
  /** True when the toggle needs an extra consent round-trip first. */
  authorization_required: boolean
  authorize_url: string | null
}

export interface SyncResult {
  ok: boolean
  summary: string
}

// --- Firm management view ---------------------------------------------------

export interface AdminConnectionRow {
  id: string
  provider: IntegrationProviderKey
  provider_label: string
  status: IntegrationStatus
  connection_scope: 'personal' | 'firm_wide'
  account_email: string | null
  connected_at: string | null
  enabled_capabilities: string[]
}

export interface AdminMemberRow {
  user_id: number
  name: string
  email: string
  org_role: 'owner' | 'admin' | 'member'
  connections: AdminConnectionRow[]
}

export interface AdminOverview {
  connection_mode: 'per_seat' | 'firm_wide'
  policies: Record<string, 'forced_on' | 'forced_off'>
  connections: {
    members: AdminMemberRow[]
    firm_wide: AdminConnectionRow[]
  }
}

export interface AdminAuditLog {
  id: string
  action: string
  provider: IntegrationProviderKey | null
  provider_label: string | null
  details: Record<string, unknown>
  ip_address: string | null
  created_at: string
  actor: { id: number; name: string; email: string } | null
}

export const useIntegrationsStore = defineStore('integrations', () => {
  const api = useApi()

  const payload = ref<IntegrationsPayload | null>(null)
  const loaded = ref(false)
  const loading = ref(false)
  /** Which provider a connect/toggle is mid-flight for, to busy its card. */
  const busyProvider = ref<IntegrationProviderKey | null>(null)

  const eligible = computed(() => payload.value?.eligible ?? false)
  const providers = computed(() => payload.value?.providers ?? [])
  const admin = computed(() => payload.value?.admin ?? null)

  async function fetch(force = false) {
    if (loaded.value && !force) return payload.value
    loading.value = true
    try {
      const { data } = await api<ApiResource<IntegrationsPayload>>('/integrations')
      payload.value = data
    } catch {
      payload.value = null
    } finally {
      loaded.value = true
      loading.value = false
    }
    return payload.value
  }

  function provider(key: IntegrationProviderKey): IntegrationProvider | null {
    return providers.value.find(p => p.provider === key) ?? null
  }

  /**
   * Start a connection. Returns the consent URL to send the browser to, plus
   * the data disclosure to show first.
   */
  async function connect(providerKey: IntegrationProviderKey): Promise<ConnectResponse> {
    busyProvider.value = providerKey
    try {
      const { data } = await api<ApiResource<ConnectResponse>>(`/integrations/${providerKey}/connect`, {
        method: 'POST',
      })
      return data
    } finally {
      busyProvider.value = null
    }
  }

  /**
   * Switch a capability on or off. When the answer says consent is required,
   * the caller sends the browser to the returned URL.
   */
  async function toggleCapability(
    providerKey: IntegrationProviderKey,
    capability: string,
    enabled: boolean,
  ): Promise<ToggleResponse> {
    const { data } = await api<ApiResource<ToggleResponse>>(
      `/integrations/${providerKey}/capabilities/${capability}`,
      { method: 'POST', body: { enabled } },
    )
    await fetch(true)
    return data
  }

  /**
   * Run a sync now across every enabled capability.
   */
  async function sync(providerKey: IntegrationProviderKey): Promise<Record<string, SyncResult>> {
    busyProvider.value = providerKey
    try {
      const { data } = await api<ApiResource<{ results: Record<string, SyncResult>; last_synced_at: string | null }>>(
        `/integrations/${providerKey}/sync`,
        { method: 'POST' },
      )
      await fetch(true)
      return data.results
    } finally {
      busyProvider.value = null
    }
  }

  /**
   * Heal a connection the provider no longer accepts. Returns the consent URL.
   */
  async function reauthorize(providerKey: IntegrationProviderKey): Promise<string> {
    busyProvider.value = providerKey
    try {
      const { data } = await api<ApiResource<{ authorize_url: string }>>(
        `/integrations/${providerKey}/reauthorize`,
        { method: 'POST' },
      )
      return data.authorize_url
    } finally {
      busyProvider.value = null
    }
  }

  async function disconnect(providerKey: IntegrationProviderKey): Promise<void> {
    busyProvider.value = providerKey
    try {
      await api(`/integrations/${providerKey}`, { method: 'DELETE' })
      await fetch(true)
    } finally {
      busyProvider.value = null
    }
  }

  // --- Firm management ------------------------------------------------------

  const adminOverview = ref<AdminOverview | null>(null)
  const auditLogs = ref<AdminAuditLog[]>([])

  async function fetchAdminOverview() {
    const { data } = await api<ApiResource<AdminOverview>>('/organizations/integrations')
    adminOverview.value = data
    return data
  }

  async function setConnectionMode(mode: 'per_seat' | 'firm_wide') {
    const { data } = await api<ApiResource<{ connection_mode: 'per_seat' | 'firm_wide' }>>(
      '/organizations/integrations/connection-mode',
      { method: 'PUT', body: { mode } },
    )
    await fetchAdminOverview()
    return data.connection_mode
  }

  async function setPolicies(policies: Record<string, 'forced_on' | 'forced_off' | null>) {
    const { data } = await api<ApiResource<{ policies: Record<string, 'forced_on' | 'forced_off'> }>>(
      '/organizations/integrations/policies',
      { method: 'PUT', body: { policies } },
    )
    await fetch(true)
    return data.policies
  }

  async function fetchAuditLogs() {
    const { data } = await api<{ data: AdminAuditLog[] }>('/organizations/integrations/audit-logs')
    auditLogs.value = data
    return data
  }

  return {
    payload,
    loaded,
    loading,
    busyProvider,
    eligible,
    providers,
    admin,
    adminOverview,
    auditLogs,
    fetch,
    provider,
    connect,
    toggleCapability,
    sync,
    reauthorize,
    disconnect,
    fetchAdminOverview,
    setConnectionMode,
    setPolicies,
    fetchAuditLogs,
  }
})
