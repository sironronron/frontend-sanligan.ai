/**
 * Holds a suspended member at the suspension notice on pages that are not
 * behind the `auth` guard — /pricing above all, which is reachable signed out
 * and would otherwise offer a suspended member a plan to buy when the seat
 * they already have is the thing that was taken away.
 *
 * Signed-out visitors pass straight through: this middleware exists to add a
 * restriction, never to require a session.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuthStore()

  if (!auth.initialized) {
    await auth.fetchUser()
  }

  if (auth.user && auth.isSuspended && to.path !== '/suspended') {
    return navigateTo('/suspended')
  }
})
