import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * The Supabase Auth client.
 *
 * One instance for the whole app: the client owns the persisted session and
 * the refresh timer, so a second instance would race the first for the same
 * localStorage key and can log the user out mid-refresh.
 *
 * The app is SPA-only (`ssr: false`), so this is always constructed in the
 * browser and can safely persist the session.
 */
let client: SupabaseClient | null = null

export function useSupabase(): SupabaseClient {
  if (client) return client

  const {
    public: { supabaseUrl, supabasePublishableKey },
  } = useRuntimeConfig()

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      'Supabase is not configured. Set NUXT_PUBLIC_SUPABASE_URL and NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
    )
  }

  client = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: true,
      // Refreshes the access token before it expires, so a long drafting
      // session never hands the API a stale token.
      autoRefreshToken: true,
      // OAuth redirects and password-recovery links come back with the session
      // in the URL fragment; this consumes it and cleans the address bar.
      detectSessionInUrl: true,
      storageKey: 'batayan.auth',
    },
  })

  return client
}

/**
 * The current access token, refreshed if it is close to expiring.
 *
 * `getSession()` is what performs the refresh, so every API call routes
 * through here rather than caching a token of its own.
 */
export async function accessToken(): Promise<string | null> {
  const { data } = await useSupabase().auth.getSession()

  return data.session?.access_token ?? null
}
