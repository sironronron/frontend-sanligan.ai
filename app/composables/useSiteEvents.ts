// Deliberately not named analytics/gtag/tracking: in dev this file is served
// at its source path, and ad blockers matching those words block it — which
// takes the whole app down with it (blank page).
type GtagParams = Record<string, string | number | boolean | undefined>

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

/**
 * GA4 event helper. A no-op until the `gtag` plugin has loaded, and entirely
 * inert when no measurement ID is configured (local dev, preview builds), so
 * call sites never need to check.
 */
export function useSiteEvents() {
  function track(event: string, params: GtagParams = {}) {
    window.gtag?.('event', event, params)
  }

  /**
   * Sends a funnel event at most once per account. Guarded in localStorage so
   * a reload of the confirmation or callback page cannot count the same
   * person twice.
   */
  function trackOnce(event: string, userKey: string, params: GtagParams = {}) {
    const key = `batayan:${event}-tracked:${userKey}`

    try {
      if (localStorage.getItem(key)) return
      localStorage.setItem(key, '1')
    } catch {
      // Storage blocked: better to risk a duplicate than to drop the event.
    }

    track(event, params)
  }

  function trackSignUp(userKey: string, params: GtagParams) {
    trackOnce('sign_up', userKey, params)
  }

  return { track, trackOnce, trackSignUp }
}
