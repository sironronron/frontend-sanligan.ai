/**
 * Where to send the user once an OAuth round trip finishes.
 *
 * The destination cannot ride along on the provider's redirect URL: Supabase
 * matches that URL against the project's allow list, so every variation of it
 * would need to be registered. It is parked here instead and picked up by
 * /auth/callback when the browser comes back.
 */
const REDIRECT_KEY = 'batayan.auth.redirect'

/**
 * Rejects anything that could leave the app. A leading `//` is a
 * protocol-relative URL — `//evil.example` is a different origin, not a path.
 */
function isInternalPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//')
}

/** Stores the post-sign-in destination. A path off-site is dropped, not stored. */
export function rememberPostAuthRedirect(path?: string | null): void {
  try {
    if (path && isInternalPath(path)) {
      sessionStorage.setItem(REDIRECT_KEY, path)
    } else {
      sessionStorage.removeItem(REDIRECT_KEY)
    }
  } catch {
    // Private-mode browsers can refuse storage. Losing the destination only
    // costs the user a redirect to their home page, so it is not worth failing
    // the sign-in over.
  }
}

/**
 * Reads the destination and clears it, so an abandoned sign-in cannot redirect
 * a later one.
 */
export function takePostAuthRedirect(): string | null {
  try {
    const path = sessionStorage.getItem(REDIRECT_KEY)

    sessionStorage.removeItem(REDIRECT_KEY)

    return path && isInternalPath(path) ? path : null
  } catch {
    return null
  }
}

/**
 * Reads the destination without clearing it. Used by screens that only want to
 * tailor their copy to the pending destination — the confirmation page, for
 * instance — and leave the actual routing to `resolveAuthDestination`.
 */
export function getPostAuthRedirect(): string | null {
  try {
    const path = sessionStorage.getItem(REDIRECT_KEY)

    return path && isInternalPath(path) ? path : null
  } catch {
    return null
  }
}

/**
 * Decides where a just-signed-in user goes next, in the order the funnel runs:
 * terms first, then (for researchers) the KYC questions, then wherever the
 * user was actually headed.
 *
 * A lawyer application is the one destination that skips the KYC questions:
 * they describe the research side of the product and are irrelevant to
 * someone joining to offer notarization. The registration page parks the
 * intent here, and the hop across email confirmation / Google consent reads it
 * back without losing it to the terms screen in between.
 */
export function resolveAuthDestination(explicitRedirect: string | null = null): string {
  const auth = useAuthStore()

  const destination = explicitRedirect || takePostAuthRedirect()

  if (!auth.hasAcceptedTerms) {
    // Terms come first. The destination is parked back in the same slot so the
    // terms page can read it once acceptance is done.
    if (destination) rememberPostAuthRedirect(destination)

    return '/terms/accept'
  }

  if (destination === '/lawyer/register') {
    return destination
  }

  if (!auth.kycCompleted) {
    return '/onboarding'
  }

  return destination ?? auth.homePath()
}
