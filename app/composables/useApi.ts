import { authHeaders } from '~/lib/http'
import { useSupabase } from '~/lib/supabase'

export function useApi() {
  const {
    public: { apiBase },
  } = useRuntimeConfig()

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
