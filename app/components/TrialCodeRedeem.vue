<script setup lang="ts">
import { CheckIcon, CircleAlertIcon, TicketIcon } from '@lucide/vue'
import { useBillingStore } from '~/stores/billing'

/**
 * Redeems an invite or referral code into a free trial. Shown to accounts that
 * have no active subscription — the point of a code is to get in before paying.
 */
const billing = useBillingStore()

const open = ref(false)
const code = ref('')
const error = ref('')
const redeeming = ref(false)

const canSubmit = computed(() => code.value.trim().length > 0 && !redeeming.value)

async function handleRedeem() {
  if (!canSubmit.value) return

  error.value = ''
  redeeming.value = true

  try {
    await billing.redeemTrialCode(code.value.trim())

    // Not `/preparing`: the workspace was set up during onboarding, and running
    // that sequence a second time reads as if redeeming undid it. The welcome
    // screen thanks the user and states what the trial gives them instead — it
    // carries the confirmation a toast used to, so there is no toast here.
    await navigateTo({
      path: '/welcome',
      query: { next: '/chat' },
    })
  } catch (err) {
    error.value = parseApiError(err, 'That code could not be redeemed.').message
  } finally {
    redeeming.value = false
  }
}
</script>

<template>
  <div class="mx-auto mt-10 w-full max-w-md text-center">
    <button
      v-if="!open"
      type="button"
      class="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      @click="open = true"
    >
      <TicketIcon class="size-4" />
      Have an invite or referral code?
    </button>

    <div v-else class="rounded-xl border bg-card p-5 text-left">
      <div class="flex items-center gap-2">
        <TicketIcon class="size-4 text-primary" />
        <h2 class="text-sm font-medium">
          Redeem your code
        </h2>
      </div>

      <p class="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        Start a free trial with no card required — a quarter of the Standard plan's
        monthly allowance, enough to run a real matter end to end. One trial per
        organization.
      </p>

      <form class="mt-4 flex gap-2" novalidate @submit.prevent="handleRedeem">
        <Input
          v-model="code"
          placeholder="BETA-2026"
          autocapitalize="characters"
          autocomplete="off"
          spellcheck="false"
          class="h-10 font-mono tracking-wider uppercase"
          :aria-invalid="error ? true : undefined"
          :aria-describedby="error ? 'trial-code-error' : undefined"
        />
        <Button type="submit" class="h-10 shrink-0" :loading="redeeming" :disabled="!canSubmit">
          <CheckIcon v-if="!redeeming" class="size-4" />
          Redeem
        </Button>
      </form>

      <p
        v-if="error"
        id="trial-code-error"
        role="alert"
        class="mt-2.5 flex items-start gap-1.5 text-xs text-destructive"
      >
        <CircleAlertIcon class="mt-px size-3.5 shrink-0" />
        <span>{{ error }}</span>
      </p>
    </div>
  </div>
</template>
