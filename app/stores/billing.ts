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
  /** `trial` is never listed for sale — it only arrives on a redeemed trial. */
  slug: 'trial' | 'standard' | 'pro' | 'firm' | 'business'
  name: string
  price: number
  price_label: string
  price_annual: number
  price_annual_label: string
  overage_price: number | null
  overage_label: string | null
  currency: string
  interval: string
  /** How many people the list price covers. */
  included_seats: number
  /** Null means the plan sells no extra seats — not that they are free. */
  seat_price: number | null
  seat_price_label: string | null
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

export type BillingInterval = 'monthly' | 'annual'

export interface Subscription {
  id: string
  status: string
  gateway: 'paymongo' | 'lemonsqueezy'
  interval: BillingInterval
  plan: Plan | null
  current_period_start: string | null
  current_period_end: string | null
  cancelled_at: string | null
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

export const useBillingStore = defineStore('billing', () => {
  const api = useApi()

  const plans = ref<Plan[]>([])
  // Ships with the plans so the labels live in one place — the same place that
  // enforces the features — rather than being retyped in each client.
  const featureCatalogue = ref<FeatureCatalogue>({})
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

  async function fetchPlans(force = false) {
    if (plansLoaded.value && !force) return plans.value
    try {
      const { data, meta } = await api<{ data: Plan[]; meta?: { features?: FeatureCatalogue } }>('/plans')
      plans.value = data.sort((a, b) => a.sort_order - b.sort_order)
      featureCatalogue.value = meta?.features ?? {}
    } catch {
      plans.value = []
      featureCatalogue.value = {}
    } finally {
      plansLoaded.value = true
    }
    return plans.value
  }

  async function fetchSubscription() {
    try {
      const { data } = await api<{ data: Subscription }>('/subscription')
      subscription.value = data
    } catch {
      subscription.value = null
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

  async function changePlan(planId: string) {
    busy.value = true
    try {
      const { data } = await api<{ data: Subscription }>('/subscription/change-plan', {
        method: 'POST',
        body: { plan_id: planId },
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

  return {
    plans,
    featureCatalogue,
    plansLoaded,
    subscription,
    subscriptionLoaded,
    busy,
    accessGranted,
    onTrial,
    trialDaysRemaining,
    plan,
    hasFeature,
    fetchPlans,
    fetchSubscription,
    subscribe,
    changePlan,
    addSeats,
    removeSeats,
    cancel,
    redeemTrialCode,
    waitForActiveSubscription,
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
