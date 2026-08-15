import { defineStore } from 'pinia'
import type { ApiList, ApiResource } from '~/composables/useApi'

export interface OrgMember {
  id: string
  name: string
  email: string
  org_role: 'owner' | 'admin' | 'member'
  org_status: 'active' | 'invited' | 'suspended'
}

export interface OrganizationProfile {
  name: string
  description: string | null
  website: string | null
}

export interface OrganizationInfo {
  id: string
  name: string
  description: string | null
  website: string | null
  /** Signed and time-limited, so it is safe to drop straight into an img src. */
  logo_url: string | null
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
  /** Only sent to the invited user, who is being told which workspace this is. */
  organization?: { id: string; name: string } | null
}

export const useOrganizationStore = defineStore('organization', () => {
  const api = useApi()
  const auth = useAuthStore()

  const organization = ref<OrganizationInfo | null>(null)
  const members = ref<OrgMember[]>([])
  const invitations = ref<OrgInvitation[]>([])
  const pendingInvites = ref<OrgInvitation[]>([])
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

  /**
   * Just the colleague list, for screens that need to name people without
   * caring about seats or billing. A solo user has no organization and gets a
   * 404/403 here, which is an answer rather than a failure: nobody to list.
   */
  async function fetchMembers() {
    try {
      const { data } = await api<ApiList<OrgMember>>('/organizations/members')
      members.value = data
    } catch {
      members.value = []
    }
    return members.value
  }

  async function fetchInvitations() {
    if (!isManager.value) {
      invitations.value = []
      return
    }
    const { data } = await api<ApiList<OrgInvitation>>('/organizations/invitations')
    invitations.value = data
  }

  /**
   * The invitations waiting for the signed-in user, addressed to their own
   * email. Read by the paywall, which offers the invite instead of a price
   * list — an invited colleague joins a workspace someone else pays for.
   *
   * A failure here is not worth surfacing: the caller falls back to whatever
   * it would have shown anyway.
   */
  async function fetchPendingInvites() {
    try {
      const { data } = await api<ApiList<OrgInvitation>>('/invitations/pending')
      pendingInvites.value = data
    } catch {
      pendingInvites.value = []
    }
    return pendingInvites.value
  }

  /**
   * Join the workspace an invitation names. The API answers with the updated
   * user, so the auth store is refreshed rather than left holding a record
   * that still says the user belongs nowhere.
   */
  async function acceptPendingInvite(id: string) {
    await api(`/invitations/${id}/accept`, { method: 'POST' })
    pendingInvites.value = pendingInvites.value.filter(invite => invite.id !== id)
    await auth.fetchUser()
  }

  /**
   * Save part of the organization profile. Only the keys passed are sent, and
   * the API treats an absent key as "leave it alone" — so a caller editing the
   * description cannot blank the website by not mentioning it.
   */
  async function updateProfile(changes: Partial<OrganizationProfile>) {
    const { data } = await api<ApiResource<OrganizationInfo>>('/organizations', {
      method: 'PATCH',
      body: changes,
    })
    organization.value = data
    return data
  }

  async function uploadLogo(file: File) {
    const body = new FormData()
    body.append('logo', file)

    // No explicit Content-Type: the boundary has to come from FormData itself.
    const { data } = await api<ApiResource<OrganizationInfo>>('/organizations/logo', {
      method: 'POST',
      body,
    })
    organization.value = data
    return data
  }

  async function removeLogo() {
    const { data } = await api<ApiResource<OrganizationInfo>>('/organizations/logo', {
      method: 'DELETE',
    })
    organization.value = data
    return data
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
    members,
    invitations,
    pendingInvites,
    loading,
    isManager,
    fetchOrganization,
    fetchMembers,
    fetchInvitations,
    fetchPendingInvites,
    acceptPendingInvite,
    updateProfile,
    uploadLogo,
    removeLogo,
    invite,
    revokeInvitation,
    removeMember,
    suspendMember,
    resumeMember,
  }
})
