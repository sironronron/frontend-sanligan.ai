import { defineStore } from 'pinia'

/**
 * One feature's copy, as the API describes it.
 *
 * `capability` features are refused by the API when the plan lacks them;
 * `service` features are delivered by people under a contract and enforced by
 * nobody. The pricing table renders the two groups apart so a tick never
 * implies a gate that does not exist.
 */
export interface PlanFeature {
  label: string
  description: string
  group: 'capability' | 'service'
}

export type FeatureCatalogue = Record<string, PlanFeature>

export interface Plan {
  id: string
  /** `trial` is offered by the registration selector, never by paid checkout. */
  slug: 'trial' | 'standard' | 'pro' | 'firm'
  name: string
  price: number
  price_label: string
  price_annual: number
  price_annual_label: string
  overage_price: number | null
  overage_label: string | null
  /** Relative AI usage tier shown on pricing. Null means not spend-gated. */
  ai_budget_label: string | null
  ai_usage_multiplier: number | null
  currency: string
  interval: string
  /** How many people the list price covers. */
  included_seats: number
  /** Null means the plan sells no extra seats — not that they are free. */
  seat_price: number | null
  seat_price_label: string | null
  /** The founding-member price of this tier, in centavos; null on contact-sales plans. */
  founding_price: number | null
  founding_price_label: string | null
  founding_price_annual: number | null
  founding_price_annual_label: string | null
  founding_seat_price: number | null
  founding_seat_price_label: string | null
  limits: {
    active_cases: number | null
    documents_uploaded: number | null
    messages_used: number | null
  }
  features: string[]
  /**
   * Priced per organization rather than listed: the card asks for a
   * conversation instead of quoting a figure, and checkout refuses the plan.
   */
  contact_sales: boolean
  annual_only: boolean
  sort_order: number
}

export interface UsageMeter {
  used: number
  limit: number | null
}

export interface MessageUsageMeter extends UsageMeter {
  overage: number
  overage_rate: number | null
  overage_due_cents: number
  overage_due_pesos: number
}

/**
 * The customer-facing AI allowance: one percent meter over the
 * subscription's anniversary window, pooled across the workspace.
 * Tokens, models, and tool calls stay on the server — this is the only
 * usage number the UI needs.
 */
export interface AiUsageMeter {
  used_pesos: number
  budget_pesos: number
  /** 0–100+, uncapped so overshoot stays visible instead of reading full. */
  percent: number
  warning: boolean
  exhausted: boolean
  warned_80_at: string | null
  window_start: string | null
  window_end: string | null
}


/**
 * Prepaid extra AI usage (ADR-010). A pack is bought for the current window and
 * expires with it; `remaining_pesos` is what the customer's own ceiling still
 * allows, or null when they have not set one.
 */
export interface TopUpPack {
  price_pesos: number
  price_label: string
  usd: number
  max_per_window: number | null
}

export interface TopUpOptions {
  available: boolean
  plan_allows: boolean
  enabled: boolean
  reason: string | null
  pack: TopUpPack | null
  cap_pesos: number | null
  spent_pesos: number
  remaining_pesos: number | null
  window_end: string | null
}

export type BillingInterval = 'monthly' | 'annual'

/**
 * The founding-member offer: the first `slots_total` subscribers pay
 * `discount_percent` off any plan for as long as they stay subscribed.
 * Checkout decides who gets the price; this only says whether it is on offer.
 */
export interface FoundingOffer {
  open: boolean
  slots_total: number
  slots_remaining: number
  discount_percent: number
}

export interface Subscription {
  id: string
  organization_id: string | null
  status: string
  gateway: 'paymongo' | 'lemonsqueezy' | 'paypal' | null
  interval: BillingInterval
  plan: Plan | null
  pending_plan_id: string | null
  pending_plan_interval: BillingInterval | null
  pending_plan_checkout_url: string | null
  current_period_start: string | null
  current_period_end: string | null
  cancelled_at: string | null
  /** Billed at the founding-member price, including after plan changes. */
  founding_member: boolean
  trial: {
    /** Gate on this, not on `status`: a lapsed trial keeps status `trialing`. */
    on_trial: boolean
    ends_at: string | null
    days_remaining: number | null
  }
  seats: {
    purchased: number
    /** Centavos, carried on the subscription rather than read off the plan. */
    price_per_seat: number | null
    next_invoice_amount: number
    next_invoice_pesos: number
  }
  usage: {
    ai_usage: AiUsageMeter
    messages: MessageUsageMeter
    documents: UsageMeter
    active_cases: UsageMeter
  }
}

export interface CheckoutSession {
  checkout_url: string | null
  payment_intent_id: string | null
  public_key: string | null
}

export interface SubscribeResponse {
  data: Subscription
  checkout: CheckoutSession
}

export interface ChangePlanResponse {
  data: Subscription
  checkout: CheckoutSession | null
}

export const useBillingStore = defineStore('billing', () => {
  const api = useApi()

  const topUp = ref<TopUpOptions | null>(null)

  const plans = ref<Plan[]>([])
  const trialPlan = ref<Plan | null>(null)
  // Ships with the plans so the labels live in one place — the same place that
  // enforces the features — rather than being retyped in each client.
  const featureCatalogue = ref<FeatureCatalogue>({})
  const foundingOffer = ref<FoundingOffer | null>(null)
  const plansLoaded = ref(false)
  const subscription = ref<Subscription | null>(null)
  /**
   * Whether `/subscription` has answered at least once. A user with no plan
   * resolves the same way an unloaded store does (`null`), so the UI cannot
   * tell the difference from the value alone — anything that renders a
   * subscriber-only state must wait for this before drawing locks or perks.
   */
  const subscriptionLoaded = ref(false)
  const busy = ref(false)

  const plansError = ref(false)
  const subscriptionError = ref(false)

  /**
   * Whether prices should be quoted at the founding-member rate for this
   * account: it already is a founding member, or the offer still has places
   * and the account is not yet paying (a trial converting counts as new).
   */
  const foundingPricing = computed(() => {
    const sub = subscription.value
    if (sub?.founding_member && sub.status !== 'cancelled') return true

    const paying = sub !== null && sub.status !== 'cancelled' && !sub.trial.on_trial

    return foundingOffer.value?.open === true && !paying
  })

  async function fetchPlans(force = false, includeTrial = false) {
    if (plansLoaded.value && !force && (!includeTrial || trialPlan.value !== null)) return plans.value
    try {
      const endpoint = includeTrial ? '/plans?include_trial=1' : '/plans'
      const { data, meta } = await api<{
        data: Plan[]
        meta?: { features?: FeatureCatalogue; founding_offer?: FoundingOffer }
      }>(endpoint)
      trialPlan.value = data.find(plan => plan.slug === 'trial') ?? trialPlan.value
      plans.value = data.filter(plan => plan.slug !== 'trial').sort((a, b) => a.sort_order - b.sort_order)
      featureCatalogue.value = meta?.features ?? {}
      foundingOffer.value = meta?.founding_offer ?? null
      plansError.value = false
    } catch {
      // Preserve the last good list so a transient failure never renders as
      // an empty catalogue with no retry.
      if (plans.value.length === 0) {
        plans.value = []
        trialPlan.value = null
        featureCatalogue.value = {}
      }
      plansError.value = true
    } finally {
      plansLoaded.value = true
    }
    return plans.value
  }

  async function fetchSubscription() {
    try {
      const { data } = await api<{ data: Subscription }>('/subscription')
      subscription.value = data
      subscriptionError.value = false
    } catch {
      // Preserve the last good subscription so a transient failure never
      // flashes as "no subscription".
      subscriptionError.value = true
    } finally {
      subscriptionLoaded.value = true
    }
    return subscription.value
  }

  async function subscribe(planId: string, interval: BillingInterval = 'monthly') {
    busy.value = true
    try {
      const res = await api<SubscribeResponse>('/subscription', {
        method: 'POST',
        body: { plan_id: planId, billing_interval: interval },
      })
      subscription.value = res.data
      return res
    } finally {
      busy.value = false
    }
  }

  async function startFreeTrial() {
    busy.value = true
    try {
      const { data } = await api<{ data: Subscription }>('/subscription/trial', {
        method: 'POST',
      })
      subscription.value = data
      subscriptionLoaded.value = true
      return data
    } finally {
      busy.value = false
    }
  }

  async function changePlan(planId: string, interval: BillingInterval = subscription.value?.interval ?? 'monthly') {
    busy.value = true
    try {
      const res = await api<ChangePlanResponse>('/subscription/change-plan', {
        method: 'POST',
        body: { plan_id: planId, billing_interval: interval },
      })
      subscription.value = res.data
      return res
    } finally {
      busy.value = false
    }
  }

  async function cancelPlanChange() {
    busy.value = true
    try {
      const { data } = await api<{ data: Subscription | null }>('/subscription/change-plan/cancel', {
        method: 'POST',
      })
      subscription.value = data
      return data
    } finally {
      busy.value = false
    }
  }

  /**
   * Buy extra seats on top of the ones the plan bundles. The API is the
   * authority on who may do this and whether the plan sells seats at all —
   * it answers 402/403/422 whatever the client offers.
   */
  async function addSeats(quantity = 1) {
    busy.value = true
    try {
      const { data } = await api<{ data: Subscription }>('/subscription/seats', {
        method: 'POST',
        body: { quantity },
      })
      subscription.value = data
      return data
    } finally {
      busy.value = false
    }
  }

  /**
   * Give seats back. Refused by the API when it would drop the count below the
   * organization's active members, so members are removed first.
   */
  async function removeSeats(quantity = 1) {
    busy.value = true
    try {
      const { data } = await api<{ data: Subscription }>('/subscription/seats', {
        method: 'DELETE',
        body: { quantity },
      })
      subscription.value = data
      return data
    } finally {
      busy.value = false
    }
  }

  async function cancel() {
    busy.value = true
    try {
      const { data } = await api<{ data: Subscription }>('/subscription/cancel', {
        method: 'POST',
      })
      subscription.value = data
      return data
    } finally {
      busy.value = false
    }
  }

  /**
   * A live trial grants the same access a paid plan does, so gating on the
   * status string alone would lock trial users out of the product they were
   * just invited into.
   */
  const accessGranted = computed(
    () => subscription.value?.status === 'active' || subscription.value?.trial.on_trial === true,
  )

  const onTrial = computed(() => subscription.value?.trial.on_trial === true)

  const trialDaysRemaining = computed(() => subscription.value?.trial.days_remaining ?? null)

  /**
   * A gateway sends the user back the moment they pay, but the subscription
   * only turns active when the webhook lands — so the return screens poll
   * rather than read the status once and call the payment failed.
   */
  async function waitForActiveSubscription(timeoutMs = 20000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs

    for (;;) {
      const sub = await fetchSubscription()
      if (sub && sub.status === 'active') return true
      if (Date.now() >= deadline) return false
      await new Promise(resolve => setTimeout(resolve, 1500))
    }
  }

  async function waitForSubscriptionPlan(planId: string, timeoutMs = 20000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs

    for (;;) {
      const sub = await fetchSubscription()
      // Require an active status, not just the plan id: an approval-pending
      // PayPal revision must never count as success.
      if (sub?.plan?.id === planId && sub?.status === 'active') return true
      if (Date.now() >= deadline) return false
      await new Promise(resolve => setTimeout(resolve, 1500))
    }
  }

  /**
   * Redeem an invite or referral code, starting the organization's trial.
   * Returns the trialing subscription and refreshes the store.
   */
  async function redeemTrialCode(code: string) {
    busy.value = true
    try {
      const { data } = await api<{ data: Subscription }>('/trial/redeem', {
        method: 'POST',
        body: { code },
      })
      subscription.value = data
      return data
    } finally {
      busy.value = false
    }
  }

  const plan = computed(() => subscription.value?.plan ?? null)

  /**
   * Whether the current plan carries a capability, keyed the same way the API
   * gates it.
   *
   * This is for choosing what to *offer* — hiding a button, or sending someone
   * to /pricing before they fill in a form the API would refuse. It is never
   * the enforcement: that lives in PlanFeatures on the server, and every gated
   * endpoint answers 402 whatever the client believes.
   */
  function hasFeature(feature: string): boolean {
    return plan.value?.features.includes(feature) ?? false
  }


  async function fetchTopUp() {
    try {
      const { data } = await api<{ data: TopUpOptions }>('/billing/top-ups')
      topUp.value = data
      return data
    } catch {
      // The control is an extra, never a blocker: a failure here must not stop
      // the billing page from rendering the subscription it already has.
      topUp.value = null
      return null
    }
  }

  async function updateTopUpSettings(enabled: boolean, capPesos: number | null) {
    const { data } = await api<{ data: TopUpOptions }>('/billing/top-ups/settings', {
      method: 'PATCH',
      body: { enabled, cap_pesos: capPesos },
    })
    topUp.value = data.options
    return data.options
  }

  /** Returns the gateway checkout URL the customer is sent to. */
  async function startTopUp(packs = 1) {
    const { data } = await api<{ data: { checkout_url: string | null } }>('/billing/top-ups', {
      method: 'POST',
      body: { packs },
    })
    return data.checkout_url
  }

  return {
    plans,
    trialPlan,
    featureCatalogue,
    foundingOffer,
    foundingPricing,
    plansLoaded,
    plansError,
    topUp,
    fetchTopUp,
    updateTopUpSettings,
    startTopUp,
    subscription,
    subscriptionLoaded,
    subscriptionError,
    busy,
    accessGranted,
    onTrial,
    trialDaysRemaining,
    plan,
    hasFeature,
    fetchPlans,
    fetchSubscription,
    subscribe,
    startFreeTrial,
    changePlan,
    cancelPlanChange,
    addSeats,
    removeSeats,
    cancel,
    redeemTrialCode,
    waitForActiveSubscription,
    waitForSubscriptionPlan,
  }
})

export function limitPct(used: number, limit: number | null): number {
  if (limit === null || limit <= 0) return 0
  return Math.min(100, Math.round((used / limit) * 100))
}

export function isAtLimit(used: number, limit: number | null): boolean {
  return limit !== null && used >= limit
}

export function upgradeMessage(err: any): string | null {
  if (err?.status === 402 || err?.response?.status === 402) {
    return err?.data?.message ?? 'You have reached the limit for your current plan'
  }
  return null
}
