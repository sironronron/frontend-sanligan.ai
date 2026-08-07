import { defineStore } from 'pinia'

export interface Plan {
  id: string
  slug: 'starter' | 'pro' | 'firm'
  name: string
  price: number
  price_label: string
  price_annual: number
  price_annual_label: string
  overage_price: number | null
  overage_label: string | null
  currency: string
  interval: string
  limits: {
    active_cases: number | null
    documents_uploaded: number | null
    messages_used: number | null
  }
  features: string[]
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
  trial_ends_at: string | null
  cancelled_at: string | null
  on_trial: boolean
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
  const plansLoaded = ref(false)
  const subscription = ref<Subscription | null>(null)
  const busy = ref(false)

  async function fetchPlans(force = false) {
    if (plansLoaded.value && !force) return plans.value
    try {
      const { data } = await api<{ data: Plan[] }>('/plans')
      plans.value = data.sort((a, b) => a.sort_order - b.sort_order)
    } catch {
      plans.value = []
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
      const { data } = await api<{ data: Subscription }>('/subscription/plan', {
        method: 'PATCH',
        body: { plan_id: planId },
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

  const accessGranted = computed(() => subscription.value?.status === 'active')

  const plan = computed(() => subscription.value?.plan ?? null)

  return {
    plans,
    plansLoaded,
    subscription,
    busy,
    accessGranted,
    plan,
    fetchPlans,
    fetchSubscription,
    subscribe,
    changePlan,
    cancel,
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
