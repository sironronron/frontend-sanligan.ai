/**
 * Holds a signed-in user at the KYC questions until they are answered. The
 * sign-in and sign-up screens already route there, but nothing stopped a
 * direct visit — a bookmark or a manual `/` — from walking past onboarding
 * into the subscription gate and landing on /pricing instead.
 *
 * Runs before `subscription`, so onboarding wins over the paywall: the
 * questions shape the product, and asking them before showing a price is the
 * order that lets someone see what they would be paying for.
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
