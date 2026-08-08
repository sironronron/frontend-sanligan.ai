import { ensureCsrfCookie, getXsrfToken, resetCsrfCookie } from '~/lib/http'

export function useApi() {
  const {
    public: { apiBase },
  } = useRuntimeConfig()

  const send = <T = unknown>(path: string, options?: Parameters<typeof $fetch>[1]) => {
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

  return async <T = unknown>(path: string, options?: Parameters<typeof $fetch>[1]) => {
    const method = String(options?.method ?? 'GET').toUpperCase()

    if (!['GET', 'HEAD'].includes(method)) {
      await ensureCsrfCookie(apiBase)
    }

    try {
      return await send<T>(path, options)
    } catch (error) {
      const status = (error as { status?: number } | undefined)?.status
        ?? (error as { statusCode?: number } | undefined)?.statusCode

      if (status === 419) {
        resetCsrfCookie()
        await ensureCsrfCookie(apiBase)

        return send<T>(path, options)
      }

      throw error
    }
  }
}

export type ApiList<T> = { data: T[] }
export type ApiResource<T> = { data: T }
