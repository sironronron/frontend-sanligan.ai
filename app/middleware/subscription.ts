export default defineNuxtRouteMiddleware(async () => {
  const auth = useAuthStore()

  if (!auth.initialized) {
    await auth.fetchUser()
  }

  if (!auth.user) {
    return navigateTo('/login')
  }

  if (auth.user.is_admin) return

  if (auth.isVerifiedLawyer) return

  const billing = useBillingStore()

  if (!billing.subscription && !billing.subscriptionLoaded) {
    await billing.fetchSubscription()
  }

  if (!billing.subscription) {
    return navigateTo('/choose-plan')
  }

  if (!billing.accessGranted) {
    return navigateTo('/pricing')
  }
})
