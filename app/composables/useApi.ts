import { ensureCsrfCookie, getXsrfToken } from '~/lib/http'

export function useApi() {
  const {
    public: { apiBase },
  } = useRuntimeConfig()

  return async <T = unknown>(path: string, options?: Parameters<typeof $fetch>[1]) => {
    const method = String(options?.method ?? 'GET').toUpperCase()

    if (!['GET', 'HEAD'].includes(method)) {
      await ensureCsrfCookie(apiBase)
    }

    const token = getXsrfToken()

    return $fetch<T>(`/api${path}`, {
      baseURL: apiBase,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(token ? { 'X-XSRF-TOKEN': token } : {}),
        ...(options?.headers as Record<string, string> | undefined),
      },
      ...options,
    })
  }
}

export type ApiList<T> = { data: T[] }
export type ApiResource<T> = { data: T }
