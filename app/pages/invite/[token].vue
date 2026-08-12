<script setup lang="ts">
import { CircleAlertIcon, CircleCheckIcon, Loader2Icon } from '@lucide/vue'

/**
 * Landing page for the organization invite email, which links here as
 * `/invite/{token}` (see OrganizationInviteMail).
 *
 * Joining requires an account, and accounts are created in Supabase — so an
 * unauthenticated visitor is sent to sign in or sign up first, with the token
 * preserved in the return path. Once signed in, redeeming is a single
 * authenticated call.
 */
definePageMeta({
  layout: 'default',
})

const auth = useAuthStore()
const route = useRoute()

const token = computed(() => String(route.params.token ?? ''))

const state = ref<'working' | 'joined' | 'failed'>('working')
const error = ref('')

async function redeem() {
  if (!auth.initialized) {
    await auth.fetchUser()
  }

  if (!auth.user) {
    // Come back here after signing in so the invite is not lost.
    await navigateTo(`/login?redirect=${encodeURIComponent(`/invite/${token.value}`)}`)

    return
  }

  try {
    await auth.acceptInvite(token.value)
    state.value = 'joined'
  } catch (err) {
    state.value = 'failed'
    error.value = parseApiError(err, 'This invitation could not be accepted.').message
  }
}

onMounted(redeem)
</script>

<template>
  <AuthShell
    title="Join your team"
    subtitle="Accepting your invitation to a Batayan workspace."
  >
    <div v-if="state === 'working'" class="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
      <Loader2Icon class="size-4 animate-spin" />
      Checking your invitation…
    </div>

    <div v-else-if="state === 'joined'" class="space-y-5">
      <div class="flex items-start gap-2.5 rounded-lg border border-forest/25 bg-forest/10 px-3.5 py-3 text-sm">
        <CircleCheckIcon class="mt-px size-4 shrink-0" />
        <span>You've joined the workspace.</span>
      </div>

      <Button class="w-full" @click="navigateTo(auth.kycCompleted ? auth.homePath() : '/onboarding')">
        Continue
      </Button>
    </div>

    <div v-else class="space-y-5">
      <div
        role="alert"
        class="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
      >
        <CircleAlertIcon class="mt-px size-4 shrink-0" />
        <span>{{ error }}</span>
      </div>

      <p class="text-sm text-muted-foreground">
        Invitations expire, and each one is tied to the email address it was sent to. Ask an
        administrator to send a new invitation if this one is no longer valid.
      </p>

      <Button variant="outline" class="w-full" @click="navigateTo('/chat')">
        Continue without joining
      </Button>
    </div>
  </AuthShell>
</template>
