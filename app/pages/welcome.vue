<script setup lang="ts">
import { CheckIcon, FileTextIcon, Loader2Icon, MessagesSquareIcon } from '@lucide/vue'
import { useBillingStore } from '~/stores/billing'

/**
 * The landing spot for the two moments an account gains access: a redeemed
 * invite code, and a completed checkout. Both used to route through
 * `/preparing`, which was wrong twice over — the workspace was already
 * prepared during onboarding, and someone who has just paid or accepted an
 * invite is owed a thank-you, not another progress bar.
 */
definePageMeta({
  layout: 'bare',
  middleware: ['auth'],
})

const auth = useAuthStore()
const billing = useBillingStore()
const route = useRoute()

/** Where "Start working" goes; the gateways come back without a `next`. */
const destination = computed(() => (route.query.next as string) || auth.homePath())

/**
 * A gateway return, rather than a code redemption. The two gateways each
 * stamp their own name on the query, matching the success URL the API builds.
 */
const fromCheckout = computed(
  () => route.query.paymongo === 'return' || route.query.lemonsqueezy === 'return',
)

const loading = ref(true)
/** Payment landed but the webhook has not; the page holds rather than thanks. */
const confirming = ref(false)
const unconfirmed = ref(false)

const sub = computed(() => billing.subscription)
const planName = computed(() => sub.value?.plan?.name ?? null)
const onTrial = computed(() => sub.value?.trial.on_trial === true)
const trialDays = computed(() => sub.value?.trial.days_remaining ?? null)

const firstName = computed(() => String(auth.user?.name ?? '').trim().split(/\s+/)[0] ?? '')

const heading = computed(() =>
  firstName.value ? `Welcome to Batayan, ${firstName.value}!` : 'Welcome to Batayan!',
)

/**
 * The thank-you names what the user actually just did — paying and redeeming
 * an invite are different favours, and a line that covers both thanks nobody.
 */
const thanks = computed(() => {
  if (fromCheckout.value) {
    return planName.value
      ? `Thank you for subscribing. Your ${planName.value} plan is active and your workspace is ready.`
      : 'Thank you for subscribing. Your plan is active and your workspace is ready.'
  }

  if (onTrial.value && trialDays.value) {
    return `Thank you for joining. Your ${trialDays.value}-day free trial has started — no card, nothing to set up.`
  }

  return 'Thank you for joining. Your free trial has started — no card, nothing to set up.'
})

/** The allowance the user just bought or was granted, in plain counts. */
const allowances = computed(() => {
  const usage = sub.value?.usage
  if (!usage) return []

  const count = (limit: number | null, unit: string) =>
    limit === null ? `Unlimited ${unit}` : `${limit.toLocaleString()} ${unit}`

  return [
    count(usage.messages.limit, 'AI messages'),
    count(usage.active_cases.limit, 'active cases'),
    count(usage.documents.limit, 'document uploads'),
  ]
})

function go(path: string) {
  navigateTo(path)
}

onMounted(async () => {
  await billing.fetchSubscription()

  // Only a checkout has a webhook to wait on; a redeemed code is already live
  // in the response the redeem call returned.
  if (fromCheckout.value && billing.subscription?.status !== 'active') {
    confirming.value = true
    unconfirmed.value = !(await billing.waitForActiveSubscription().catch(() => false))
    confirming.value = false
  }

  loading.value = false
})
</script>

<template>
  <div class="welcome">
    <div aria-hidden="true" class="wash" />

    <div class="relative flex w-full max-w-md flex-col items-center px-6 text-center">
      <!--
        Payment is confirmed before anything is celebrated: thanking someone for
        a subscription that has not landed yet is a promise the page cannot keep.
      -->
      <template v-if="loading || confirming">
        <Loader2Icon class="size-7 animate-spin text-primary" />
        <p class="mt-4 text-sm font-medium">
          {{ confirming ? 'Confirming your payment…' : 'One moment…' }}
        </p>
        <p v-if="confirming" class="mt-1 text-xs text-muted-foreground">
          This can take a few seconds.
        </p>
      </template>

      <template v-else>
        <!-- The sealed document that `/preparing` ends on, arriving already
             stamped: the work is finished, so the screen opens on the seal. -->
        <span class="seal" aria-hidden="true">
          <CheckIcon class="size-8" :stroke-width="3" />
        </span>

        <h1 class="reveal mt-7 font-heading text-3xl font-bold tracking-tight" style="--reveal-delay: 0.1s">
          {{ heading }}
        </h1>

        <p
          class="reveal mt-3 text-sm leading-relaxed text-balance text-muted-foreground"
          style="--reveal-delay: 0.18s"
        >
          {{ thanks }}
        </p>

        <!-- The webhook can outrun the timeout. Saying so is better than either
             a false "you're all set" or bouncing the user back to pay again. -->
        <p
          v-if="unconfirmed"
          class="reveal mt-4 rounded-lg border border-primary/25 bg-primary/10 px-4 py-2.5 text-xs leading-relaxed"
          style="--reveal-delay: 0.24s"
        >
          Your payment is still being confirmed with the gateway. You can start working now —
          the plan will appear in your billing settings shortly.
        </p>

        <ul
          v-if="allowances.length"
          class="reveal mt-6 flex flex-col gap-2 text-sm"
          style="--reveal-delay: 0.3s"
        >
          <li v-for="line in allowances" :key="line" class="flex items-center gap-2">
            <CheckIcon class="size-4 shrink-0 text-primary" :stroke-width="2.5" />
            <span>{{ line }}</span>
          </li>
        </ul>

        <!-- Two doors rather than one "Continue": the moment someone finishes
             paying is the moment they need somewhere specific to go. -->
        <div class="reveal mt-8 grid w-full gap-2 sm:grid-cols-2" style="--reveal-delay: 0.38s">
          <Button class="w-full gap-1.5" @click="go(destination)">
            <MessagesSquareIcon class="size-4" />
            Ask a question
          </Button>
          <Button variant="outline" class="w-full gap-1.5" @click="go('/cases')">
            <FileTextIcon class="size-4" />
            Create a case
          </Button>
        </div>

        <button
          type="button"
          class="reveal mt-4 text-xs text-muted-foreground underline-offset-2 hover:underline"
          style="--reveal-delay: 0.44s"
          @click="go('/settings/billing')"
        >
          View plan and usage
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.welcome {
  position: relative;
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 3rem 0;
}

/* The same wash `/preparing` sits on, so arriving here reads as the end of
   that sequence rather than a different screen entirely. */
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

/* Each line lands just after the one above it, so the page settles in reading
   order instead of appearing all at once under the seal. */
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
