import { accessToken } from '~/lib/supabase'

/**
 * Request headers for a call to the Laravel API.
 *
 * The API authenticates the Supabase access token from the `Authorization`
 * header (see the `supabase` guard). It is entirely stateless — there is no
 * session cookie and no CSRF token to fetch first, which is why callers no
 * longer need a priming request before a POST.
 */
export async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const token = await accessToken()

  return {
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}
