export default defineNuxtRouteMiddleware(async () => {
  const auth = useAuthStore()

  if (!auth.initialized) {
    await auth.fetchUser()
  }

  if (!auth.user) {
    return navigateTo('/login')
  }

  // The document-vetting workspace is open to verified lawyers only. Everyone
  // else is shown the step they are on rather than a dead end: no profile yet
  // means apply, a pending profile means wait out the review, and a rejection
  // returns to the form to fix and resubmit.
  const status = auth.user.lawyer_profile?.verification_status

  if (!status || status === 'rejected') {
    return navigateTo('/lawyer/register')
  }

  if (status !== 'verified') {
    return navigateTo('/lawyer/pending')
  }
})
