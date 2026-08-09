import { defineStore } from 'pinia'

export interface User {
  id: string
  name: string
  email: string
  is_admin: boolean
  organization_id: string | null
  org_role: 'owner' | 'admin' | 'member' | null
  org_status: 'active' | 'invited' | 'suspended' | null
  created_at: string
}

export const useAuthStore = defineStore('auth', () => {
  const api = useApi()

  const user = ref<User | null>(null)
  const initialized = ref(false)
  const busy = ref(false)

  const hasOrganization = computed(() => user.value?.organization_id != null)

  function homePath() {
    if (!hasOrganization.value) return '/organization/setup'
    return '/chat'
  }

  async function fetchUser() {
    try {
      const { data } = await api<{ data: User }>('/user')
      user.value = data
    } catch {
      user.value = null
    } finally {
      initialized.value = true
    }
  }

  async function login(email: string, password: string) {
    busy.value = true
    try {
      const { data } = await api<{ data: User }>('/login', {
        method: 'POST',
        body: { email, password },
      })
      user.value = data
    } finally {
      busy.value = false
    }
  }

  async function register(name: string, email: string, password: string) {
    busy.value = true
    try {
      const { data } = await api<{ data: User }>('/register', {
        method: 'POST',
        body: { name, email, password, password_confirmation: password },
      })
      user.value = data
    } finally {
      busy.value = false
    }
  }

  async function createOrganization(name: string) {
    busy.value = true
    try {
      const { data } = await api<{ data: User }>('/organizations', {
        method: 'POST',
        body: { name },
      })
      user.value = data
      return data
    } finally {
      busy.value = false
    }
  }

  async function logout() {
    try {
      await api('/logout', { method: 'POST' })
    } finally {
      user.value = null
    }
  }

  async function sendPasswordResetLink(email: string) {
    return api<{ message: string }>('/forgot-password', {
      method: 'POST',
      body: { email },
    })
  }

  async function resetPassword(token: string, email: string, password: string) {
    return api<{ message: string }>('/reset-password', {
      method: 'POST',
      body: { token, email, password, password_confirmation: password },
    })
  }

  return {
    user,
    initialized,
    busy,
    hasOrganization,
    homePath,
    fetchUser,
    login,
    register,
    createOrganization,
    logout,
    sendPasswordResetLink,
    resetPassword,
  }
})
