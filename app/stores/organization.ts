import { defineStore } from 'pinia'
import type { ApiList, ApiResource } from '~/composables/useApi'

export interface OrgMember {
  id: string
  name: string
  email: string
  org_role: 'owner' | 'admin' | 'member'
  org_status: 'active' | 'invited' | 'suspended'
}

export interface OrganizationInfo {
  id: string
  name: string
  role: 'owner' | 'admin' | 'member'
  created_at: string | null
  seats: {
    purchased: number | null
    used: number
    pending_invites: number
    free: number | null
    price_per_seat: number | null
  }
  members: OrgMember[]
}

export interface OrgInvitation {
  id: string
  email: string
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
  expires_at: string | null
  invited_by: { id: string; name: string; email: string } | null
  created_at: string
}

export const useOrganizationStore = defineStore('organization', () => {
  const api = useApi()
  const auth = useAuthStore()

  const organization = ref<OrganizationInfo | null>(null)
  const invitations = ref<OrgInvitation[]>([])
  const loading = ref(false)

  const isManager = computed(() => {
    const role = auth.user?.org_role ?? organization.value?.role ?? null
    return role === 'owner' || role === 'admin'
  })

  async function fetchOrganization() {
    loading.value = true
    try {
      const { data } = await api<ApiResource<OrganizationInfo>>('/organizations')
      organization.value = data
    } finally {
      loading.value = false
    }
  }

  async function fetchInvitations() {
    if (!isManager.value) {
      invitations.value = []
      return
    }
    const { data } = await api<ApiList<OrgInvitation>>('/organizations/invitations')
    invitations.value = data
  }

  async function invite(email: string) {
    await api<ApiResource<OrgInvitation>>('/organizations/invitations', {
      method: 'POST',
      body: { email },
    })
    await fetchInvitations()
    await fetchOrganization()
  }

  async function revokeInvitation(id: string) {
    await api(`/organizations/invitations/${id}`, { method: 'DELETE' })
    await fetchInvitations()
    await fetchOrganization()
  }

  async function removeMember(id: string) {
    await api(`/organizations/members/${id}`, { method: 'DELETE' })
    await fetchOrganization()
  }

  async function suspendMember(id: string) {
    await api(`/organizations/members/${id}/suspend`, { method: 'POST' })
    await fetchOrganization()
  }

  async function resumeMember(id: string) {
    await api(`/organizations/members/${id}/resume`, { method: 'POST' })
    await fetchOrganization()
  }

  return {
    organization,
    invitations,
    loading,
    isManager,
    fetchOrganization,
    fetchInvitations,
    invite,
    revokeInvitation,
    removeMember,
    suspendMember,
    resumeMember,
  }
})
