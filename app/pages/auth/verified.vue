<script setup lang="ts">
import { ArrowRightIcon, CircleAlertIcon, Loader2Icon, MailCheckIcon } from '@lucide/vue'
import { useSupabase } from '~/lib/supabase'

definePageMeta({
  layout: 'bare',
  // Deliberately unguarded. `guest` would bounce the arriving user before the
  // session this page exists to confirm has been detected, and `auth` would
  // race it for the same reason the callback page stays open.
})

const auth = useAuthStore()

const state = ref<'checking' | 'verified' | 'failed'>('checking')
const continuing = ref(false)

/** Seconds until the page walks the user onward on its own; 0 disables it. */
const countdown = ref(0)

const firstName = computed(() => String(auth.user?.name ?? '').trim().split(/\s+/)[0] ?? '')

/**
 * Supabase exchanges the confirmation code as part of client start-up, so the
 * first `getSession()` normally answers; the retry covers the case where the
 * session is still being written to storage.
 */
async function waitForSession() {
  const supabase = useSupabase()

  for (let attempt = 0; attempt < 20; attempt++) {
    const { data } = await supabase.auth.getSession()

    if (data.session) return true

    await new Promise(resolve => setTimeout(resolve, 250))
  }

  return false
}

// Same order the email/password sign-up walks: terms, then the KYC questions,
// then the app. A returning user has both behind them and goes straight
// through to wherever they'd normally land.
async function continueToApp() {
  if (continuing.value) return

  continuing.value = true

  if (!auth.hasAcceptedTerms) {
    await navigateTo('/terms/accept')
  } else if (!auth.kycCompleted) {
    await navigateTo('/onboarding')
  } else {
    await navigateTo(auth.homePath())
  }
}

onMounted(async () => {
  const sessionFound = await waitForSession()

  if (!sessionFound) {
    state.value = 'failed'

    return
  }

  // The plugin fetches the profile when it finds a session at start-up; this
  // covers the ordering where the session landed after that ran.
  if (!auth.user) await auth.fetchUser()

  if (!auth.user) {
    state.value = 'failed'

    return
  }

  state.value = 'verified'

  // A long pause on a page that has already done its job invites a reload;
  // walking the user on keeps the confirmation feeling like it worked.
  countdown.value = 6
})

let tick: ReturnType<typeof setInterval> | null = null

watch(countdown, value => {
  if (value > 0 && tick === null) {
    tick = setInterval(() => {
      countdown.value -= 1

      if (countdown.value <= 0) {
        if (tick) clearInterval(tick)
        continueToApp()
      }
    }, 1000)
  }
})

onUnmounted(() => {
  if (tick) clearInterval(tick)
})
</script>

<template>
  <div class="verified">
    <div aria-hidden="true" class="wash" />

    <div class="relative flex w-full max-w-md flex-col items-center px-6 text-center">
      <template v-if="state === 'checking'">
        <Loader2Icon class="size-7 animate-spin text-primary" />
        <p class="mt-4 text-sm font-medium">Confirming your email…</p>
        <p class="mt-1 text-xs text-muted-foreground">This can take a few seconds.</p>
      </template>

      <template v-else-if="state === 'verified'">
        <span class="seal" aria-hidden="true">
          <MailCheckIcon class="size-8" :stroke-width="2.5" />
        </span>

        <h1 class="reveal mt-7 font-heading text-3xl font-bold tracking-tight" style="--reveal-delay: 0.1s">
          {{ firstName ? `You're in, ${firstName}!` : 'You\'re in!' }}
        </h1>

        <p
          class="reveal mt-3 text-sm leading-relaxed text-balance text-muted-foreground"
          style="--reveal-delay: 0.18s"
        >
          Your email is verified and your account is ready. Start researching Philippine law
          with Batayan.
        </p>

        <div class="reveal mt-8 w-full" style="--reveal-delay: 0.3s">
          <Button class="h-11 w-full gap-1.5 text-sm" :loading="continuing" @click="continueToApp">
            Continue to Batayan
            <ArrowRightIcon v-if="!continuing" class="size-4" />
          </Button>
        </div>

        <p class="reveal mt-4 text-xs text-muted-foreground" style="--reveal-delay: 0.4s">
          <template v-if="countdown > 0">Taking you to your workspace in {{ countdown }}…</template>
          <template v-else>One moment — taking you to your workspace…</template>
        </p>
      </template>

      <template v-else>
        <span
          class="reveal mx-auto flex size-16 items-center justify-center rounded-full border-2 border-destructive bg-destructive/10 text-destructive"
          style="--reveal-delay: 0.1s"
        >
          <CircleAlertIcon class="size-7" :stroke-width="2.5" />
        </span>

        <h1 class="reveal mt-7 font-heading text-3xl font-bold tracking-tight" style="--reveal-delay: 0.18s">
          That link didn't work
        </h1>

        <p
          class="reveal mt-3 text-sm leading-relaxed text-balance text-muted-foreground"
          style="--reveal-delay: 0.26s"
        >
          The confirmation link may have expired or already been used. You can request a fresh
          one by signing up again with the same email address — you'll get a new link in your
          inbox.
        </p>

        <div class="reveal mt-8 w-full" style="--reveal-delay: 0.36s">
          <Button variant="outline" class="h-11 w-full text-sm" @click="navigateTo('/login')">
            Back to sign in
          </Button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* Same centered wash the welcome and preparing pages sit on, so arriving here
   reads as the end of a sequence rather than a screen of its own. */
.verified {
  position: relative;
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 3rem 0;
}

.wash {
  position: absolute;
  top: 50%;
  left: 50%;
  width: min(44rem, 120vw);
  height: min(44rem, 120vw);
  transform: translate(-50%, -50%);
  border-radius: 9999px;
  background: radial-gradient(
    circle,
    color-mix(in oklab, var(--color-primary) 12%, transparent) 0%,
    transparent 68%
  );
  pointer-events: none;
}

/* Stamped, not faded in: overshoot then settle, slightly off-square like a
   seal pressed by hand. */
.seal {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4.5rem;
  height: 4.5rem;
  border-radius: 9999px;
  border: 2px solid var(--color-primary);
  color: var(--color-primary);
  background: color-mix(in oklab, var(--color-primary) 10%, transparent);
  box-shadow: 0 0 0 8px color-mix(in oklab, var(--color-primary) 8%, transparent);
  animation: stamp 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes stamp {
  from { opacity: 0; transform: scale(1.6) rotate(-18deg); }
  to { opacity: 1; transform: scale(1) rotate(-7deg); }
}

/* Each element lands just after the one above it, so the page settles in
   reading order instead of appearing all at once under the seal. */
.reveal {
  animation: reveal 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: var(--reveal-delay, 0s);
}

@keyframes reveal {
  from { opacity: 0; transform: translateY(0.5rem); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .seal,
  .reveal {
    animation-duration: 0.01ms;
  }

  .seal {
    transform: rotate(-7deg);
  }
}
</style>