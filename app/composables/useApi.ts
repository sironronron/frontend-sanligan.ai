import { authHeaders } from '~/lib/http'
import { useSupabase } from '~/lib/supabase'

export function useApi() {
  const {
    public: { apiBase },
  } = useRuntimeConfig()

  // Captured here rather than inside the handler below: by the time a request
  // fails the Nuxt instance may no longer be the active one, and the composable
  // itself is always called from setup.
  const router = useRouter()

  return async <T = unknown>(path: string, options?: Parameters<typeof $fetch>[1]) => {
    const headers = await authHeaders(options?.headers as Record<string, string> | undefined)

    try {
      return await $fetch<T>(`/api${path}`, {
        baseURL: apiBase,
        ...options,
        headers,
      })
    } catch (error) {
      const status = (error as { status?: number } | undefined)?.status
        ?? (error as { statusCode?: number } | undefined)?.statusCode

      // The API refuses a suspended member on every route it guards. A tab that
      // was already open when the suspension landed would otherwise sit there
      // failing request by request, since the route guards only run on a
      // navigation — so the first refusal is what performs it.
      if (status === 403 && (error as { data?: { suspended?: boolean } } | undefined)?.data?.suspended) {
        const auth = useAuthStore()

        // /user is deliberately left open to a suspended member, so this
        // reaches the store rather than looping back through this branch.
        if (!auth.isSuspended) {
          await auth.fetchUser()
        }

        if (router.currentRoute.value.path !== '/suspended') {
          await router.push('/suspended')
        }
      }

      // A 401 means the token the API saw was rejected. The usual cause is an
      // access token that expired while the tab was asleep, so force one
      // refresh and retry before giving up on the session.
      if (status === 401) {
        const { data } = await useSupabase().auth.refreshSession()

        if (data.session) {
          return await $fetch<T>(`/api${path}`, {
            baseURL: apiBase,
            ...options,
            headers: await authHeaders(options?.headers as Record<string, string> | undefined),
          })
        }
      }

      throw error
    }
  }
}

export type ApiList<T> = { data: T[] }
export type ApiResource<T> = { data: T }
