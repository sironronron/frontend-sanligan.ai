/**
 * Holds a signed-in user at the KYC questions until they are answered. The
 * sign-in and sign-up screens already route there, but nothing stopped a
 * direct visit — a bookmark or a manual `/` — from walking past onboarding
 * into the subscription gate and landing on /pricing instead.
 *
 * Runs after `organization`, so a user without an org is sent to create one
 * first, and before `subscription`, so onboarding wins over the paywall.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuthStore()

  if (!auth.initialized) {
    await auth.fetchUser()
  }

  if (!auth.user) {
    return navigateTo('/login')
  }

  if (auth.user.is_admin) return

  if (!auth.kycCompleted) {
    return navigateTo(`/onboarding?next=${encodeURIComponent(to.fullPath)}`)
  }
})
