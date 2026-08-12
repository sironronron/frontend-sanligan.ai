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
