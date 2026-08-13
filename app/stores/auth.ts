import { defineStore } from 'pinia'
import { useSupabase } from '~/lib/supabase'
import type { KycProfilePayload } from '~/utils/kyc'

export interface User {
  id: string
  name: string
  email: string
  is_admin: boolean
  organization_id: string | null
  org_role: 'owner' | 'admin' | 'member' | null
  org_status: 'active' | 'invited' | 'suspended' | null
  kyc_role: string | null
  kyc_role_other: string | null
  kyc_use_case: string | null
  kyc_use_case_other: string | null
  kyc_document_types: string | null
  kyc_experience_level: string | null
  kyc_completed_at: string | null
  tour_completed_at: string | null
  terms_accepted_at: string | null
  terms_version: string | null
  /** True only when the accepted version matches the version currently published. */
  terms_accepted: boolean
  terms_current_version: string
  marketing_opt_in: boolean
  created_at: string
}

export const useAuthStore = defineStore('auth', () => {
  const api = useApi()

  const user = ref<User | null>(null)
  const initialized = ref(false)
  const busy = ref(false)

  const hasOrganization = computed(() => user.value?.organization_id != null)

  const kycCompleted = computed(() => user.value?.kyc_completed_at != null)

  const hasAcceptedTerms = computed(() => user.value?.terms_accepted === true)

  /** The user accepted an earlier version and has to accept the updated terms. */
  const needsTermsReacceptance = computed(
    () => user.value != null && user.value.terms_accepted_at != null && !user.value.terms_accepted,
  )

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

  /**
   * Credentials are verified by Supabase, never by the API. On success the
   * client stores the session and every subsequent API call carries its
   * access token, which the backend exchanges for the local user record.
   */
  async function login(email: string, password: string) {
    busy.value = true
    try {
      const { error } = await useSupabase().auth.signInWithPassword({ email, password })

      if (error) throw error

      await fetchUser()

      if (!user.value) {
        throw new Error('Signed in, but your Batayan profile could not be loaded.')
      }
    } finally {
      busy.value = false
    }
  }

  /**
   * Creates the Supabase account. When the project requires email
   * confirmation no session is returned, so the caller is told to check their
   * inbox instead of being sent into the app.
   */
  async function register(name: string, email: string, password: string) {
    busy.value = true
    try {
      const { data, error } = await useSupabase().auth.signUp({
        email,
        password,
        options: {
          // Read back by the API from the JWT's user_metadata.full_name.
          data: { full_name: name },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      })

      if (error) throw error

      if (!data.session) {
        return { confirmationRequired: true as const }
      }

      await fetchUser()

      return { confirmationRequired: false as const }
    } finally {
      busy.value = false
    }
  }

  /**
   * Starts Google OAuth, covering both sign-in and sign-up: Supabase creates
   * the account on first consent, and the API provisions the local user from
   * the JWT the same way it does for an email/password sign-up.
   *
   * The browser leaves for Google's consent screen, so nothing after this runs
   * on success. The flow resumes at /auth/callback, which owns the routing
   * into terms, onboarding, or the app.
   */
  async function loginWithGoogle(next?: string) {
    busy.value = true

    // Carried outside the OAuth round trip, since the redirect URL itself has
    // to stay fixed to match Supabase's allow list.
    rememberPostAuthRedirect(next)

    const { error } = await useSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // Without this Google reuses whichever account is already signed in,
        // which strands anyone holding a separate work account.
        queryParams: { prompt: 'select_account' },
      },
    })

    // Reached only when the redirect never happened — `busy` is otherwise left
    // set so the button stays disabled until the page unloads.
    if (error) {
      busy.value = false

      throw error
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
      // Clears the persisted session and stops the refresh timer. There is no
      // server-side session to destroy — the API is stateless.
      await useSupabase().auth.signOut()
    } finally {
      user.value = null
      initialized.value = false
    }
  }

  async function saveKyc(payload: KycProfilePayload) {
    busy.value = true
    try {
      const { data } = await api<{ data: User }>('/kyc', {
        method: 'PUT',
        body: payload,
      })
      user.value = data
      return data
    } finally {
      busy.value = false
    }
  }

  async function clearKyc() {
    busy.value = true
    try {
      await api('/kyc', { method: 'DELETE' })
      if (user.value) {
        user.value = {
          ...user.value,
          kyc_role: null,
          kyc_role_other: null,
          kyc_use_case: null,
          kyc_use_case_other: null,
          kyc_document_types: null,
          kyc_experience_level: null,
          kyc_completed_at: null,
        }
      }
    } finally {
      busy.value = false
    }
  }

  /**
   * Record that the product tour is done. Stored on the account rather than in
   * the browser so it does not reappear on the user's next device.
   */
  async function completeTour() {
    if (!user.value || user.value.tour_completed_at !== null) return

    // Applied locally first: the tour closes immediately, and a failed request
    // only means it may be offered again on the next sign-in.
    user.value = { ...user.value, tour_completed_at: new Date().toISOString() }

    await api('/tour/complete', { method: 'POST' })
  }

  async function acceptTerms(marketingOptIn: boolean = false) {
    busy.value = true
    try {
      await api('/terms/accept', {
        method: 'POST',
        body: { marketing_opt_in: marketingOptIn },
      })
      if (user.value) {
        user.value = {
          ...user.value,
          terms_accepted_at: new Date().toISOString(),
          terms_version: user.value.terms_current_version,
          terms_accepted: true,
          marketing_opt_in: marketingOptIn,
        }
      }
    } finally {
      busy.value = false
    }
  }

  async function sendPasswordResetLink(email: string) {
    busy.value = true
    try {
      const { error } = await useSupabase().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) throw error

      return { message: 'If that email is registered, a reset link is on its way.' }
    } finally {
      busy.value = false
    }
  }

  /**
   * Completes a password reset. The recovery link puts a session in the URL
   * which the client has already consumed (detectSessionInUrl), so this is an
   * update of the signed-in user rather than a token exchange.
   */
  async function resetPassword(password: string) {
    busy.value = true
    try {
      const { error } = await useSupabase().auth.updateUser({ password })

      if (error) throw error

      await fetchUser()

      return { message: 'Your password has been updated.' }
    } finally {
      busy.value = false
    }
  }

  /**
   * Redeem an emailed organization invite. The account already exists in
   * Supabase by this point; joining is a separate, authenticated API call.
   */
  async function acceptInvite(token: string) {
    busy.value = true
    try {
      const { data } = await api<{ data: User }>('/organizations/invitations/accept', {
        method: 'POST',
        body: { token },
      })
      user.value = data
      return data
    } finally {
      busy.value = false
    }
  }

  return {
    user,
    initialized,
    busy,
    hasOrganization,
    kycCompleted,
    hasAcceptedTerms,
    needsTermsReacceptance,
    homePath,
    fetchUser,
    login,
    loginWithGoogle,
    register,
    acceptInvite,
    createOrganization,
    logout,
    saveKyc,
    clearKyc,
    acceptTerms,
    completeTour,
    sendPasswordResetLink,
    resetPassword,
  }
})
