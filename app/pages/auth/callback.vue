<script setup lang="ts">
import { CircleAlertIcon, Loader2Icon } from '@lucide/vue'
import { useSupabase } from '~/lib/supabase'

definePageMeta({
  layout: 'bare',
  // Deliberately unguarded. `guest` would bounce the arriving user before the
  // onboarding checks below run, and `auth` would race the session this page
  // exists to establish.
})

const auth = useAuthStore()
const error = ref('')

/**
 * A refused or cancelled consent comes back on the URL rather than as a thrown
 * error — in the query string under the PKCE flow, in the fragment under the
 * implicit one, so both are checked.
 */
function oauthError(): string {
  const query = useRoute().query
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''))

  const code = (query.error as string | undefined) ?? fragment.get('error') ?? ''
  const description = (query.error_description as string | undefined) ?? fragment.get('error_description') ?? ''

  if (code === '' && description === '') return ''

  if (code === 'access_denied') return 'Google sign-in was cancelled.'

  return description || 'Google sign-in failed. Please try again.'
}

/**
 * `detectSessionInUrl` exchanges the code as part of client start-up and
 * `getSession()` waits on that, so the first call normally answers. The retry
 * covers the case where the session is still being written to storage.
 */
async function waitForSession() {
  const supabase = useSupabase()

  for (let attempt = 0; attempt < 20; attempt++) {
    const { data } = await supabase.auth.getSession()

    if (data.session) return data.session

    await new Promise(resolve => setTimeout(resolve, 250))
  }

  return null
}

onMounted(async () => {
  const refused = oauthError()

  if (refused !== '') {
    error.value = refused

    return
  }

  if (!await waitForSession()) {
    error.value = 'Google sign-in did not complete. Please try again.'

    return
  }

  // The plugin fetches the profile when it finds a session at start-up; this
  // covers the ordering where the session landed after that ran.
  if (!auth.user) await auth.fetchUser()

  if (!auth.user) {
    error.value = 'Signed in with Google, but your Batayan profile could not be loaded.'

    return
  }

  const next = takePostAuthRedirect()

  // Same order the email/password sign-up walks: terms, then the KYC
  // questions, then wherever the user was actually headed. A returning user
  // has both behind them and goes straight through.
  if (!auth.hasAcceptedTerms) {
    await navigateTo('/terms/accept')

    return
  }

  if (!auth.kycCompleted) {
    await navigateTo('/onboarding')

    return
  }

  await navigateTo(next ?? auth.homePath())
})
</script>

<template>
  <div class="flex flex-1 items-center justify-center px-5 py-12">
    <div v-if="error" class="w-full max-w-[24rem] space-y-5">
      <div
        role="alert"
        class="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
      >
        <CircleAlertIcon class="mt-px size-4 shrink-0" />
        <span>{{ error }}</span>
      </div>

      <Button variant="outline" class="h-10 w-full" @click="navigateTo('/login')">
        Back to sign in
      </Button>
    </div>

    <div v-else class="flex flex-col items-center gap-3 text-muted-foreground">
      <Loader2Icon class="size-5 animate-spin" />
      <p class="text-sm">
        Finishing sign-in…
      </p>
    </div>
  </div>
</template>
