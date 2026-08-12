import { useSupabase } from '~/lib/supabase'

/**
 * Brings the persisted Supabase session back before the first route guard
 * runs, and keeps the Pinia store in step with it afterwards.
 *
 * Without this, `getSession()` inside the first API call would still be
 * reading the session off localStorage while the `auth` middleware had already
 * decided the user was signed out and redirected to /login.
 */
export default defineNuxtPlugin(async () => {
  const supabase = useSupabase()
  const auth = useAuthStore()

  const { data } = await supabase.auth.getSession()

  if (data.session) {
    await auth.fetchUser()
  } else {
    auth.initialized = true
  }

  supabase.auth.onAuthStateChange((event) => {
    // TOKEN_REFRESHED fires on the silent refresh timer and changes nothing
    // about who is signed in, so the profile is not refetched for it.
    if (event === 'SIGNED_OUT') {
      auth.user = null
      auth.initialized = true

      return
    }

    if (event === 'SIGNED_IN' && !auth.user) {
      void auth.fetchUser()
    }
  })
})
