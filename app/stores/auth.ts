import { defineStore } from 'pinia'

export interface User {
  id: string
  name: string
  email: string
  is_admin: boolean
  created_at: string
}

export const useAuthStore = defineStore('auth', () => {
  const api = useApi()

  const user = ref<User | null>(null)
  const initialized = ref(false)
  const busy = ref(false)

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
    fetchUser,
    login,
    register,
    logout,
    sendPasswordResetLink,
    resetPassword,
  }
})
