let csrfReady: Promise<void> | null = null

export function ensureCsrfCookie(base: string): Promise<void> {
  if (!csrfReady) {
    csrfReady = $fetch<void>('/sanctum/csrf-cookie', {
      baseURL: base,
      credentials: 'include',
    }).catch((error) => {
      csrfReady = null
      throw error
    })
  }

  return csrfReady
}

export function getXsrfToken(): string | null {
  if (typeof document === 'undefined') return null

  const match = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/)

  if (!match) return null

  try {
    return decodeURIComponent(match[1] as string)
  } catch {
    return match[1] as string
  }
}
