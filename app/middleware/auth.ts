export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuthStore()

  if (!auth.initialized) {
    await auth.fetchUser()
  }

  if (!auth.user) {
    return navigateTo('/login')
  }

  // A suspended member keeps a valid session and a paid-up organization behind
  // them, so every other guard waves them through. This is the one that does
  // not: they see the suspension notice and nothing else until they leave the
  // organization or an admin reinstates them. The API refuses them in the same
  // breath, so this is the explanation rather than the enforcement.
  if (auth.isSuspended && to.path !== '/suspended') {
    return navigateTo('/suspended')
  }
})
