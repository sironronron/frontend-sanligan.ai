<script setup lang="ts">
import { CheckIcon, CreditCardIcon, Loader2Icon, SparklesIcon } from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import { useBillingStore, isAtLimit, limitPct } from '~/stores/billing'

definePageMeta({
  middleware: ['auth', 'organization'],
  layout: 'default',
})

const billing = useBillingStore()
const route = useRoute()

const loading = ref(true)
const confirmingPayment = ref(false)
const cancelling = ref(false)

async function waitForActiveSubscription(timeoutMs = 20000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const sub = await billing.fetchSubscription()
    if (sub && sub.status === 'active') return true
    if (Date.now() >= deadline) return false
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
}

const sub = computed(() => billing.subscription)

const statusLabel: Record<string, string> = {
  incomplete: 'Awaiting payment',
  incomplete_cancelled: 'Payment failed',
  active: 'Active',
  past_due: 'Payment overdue',
  unpaid: 'Payment failed',
  cancelled: 'Cancelled',
}

const statusStyles: Record<string, string> = {
  active: 'bg-forest/10 text-forest dark:bg-cream/10 dark:text-peach',
  past_due: 'bg-espresso/10 text-espresso dark:bg-cream/10 dark:text-peach',
  incomplete: 'bg-espresso/10 text-espresso dark:bg-cream/10 dark:text-peach',
  incomplete_cancelled: 'bg-destructive/10 text-destructive dark:bg-cream/10 dark:text-destructive',
  unpaid: 'bg-destructive/10 text-destructive dark:bg-cream/10 dark:text-destructive',
  cancelled: 'bg-muted text-muted-foreground',
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatCount(value: number | null) {
  return value === null ? 'Unlimited' : value.toLocaleString()
}

const gatewayLabel: Record<string, string> = {
  paymongo: 'PayMongo',
  lemonsqueezy: 'Lemon Squeezy',
}

async function handleCancel() {
  if (!sub.value) return
  cancelling.value = true
  try {
    await billing.cancel()
    toast.success('Your subscription has been cancelled')
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not cancel the subscription')
  } finally {
    cancelling.value = false
  }
}

onMounted(async () => {
  await Promise.all([billing.fetchPlans(), billing.fetchSubscription()])
  loading.value = false

  if (route.query.paymongo === 'return' || route.query.lemonsqueezy === 'return') {
    confirmingPayment.value = true
    const active = await waitForActiveSubscription(20000).catch(() => false)
    confirmingPayment.value = false
    if (active) {
      toast.success('Your subscription is active')
    } else {
      toast.info('Payment is being confirmed. Check back shortly.')
    }
  }
})

// -- isAtLimit / limitPct are referenced via template in the meters
const meters = computed(() => {
  if (!sub.value) return []
  const u = sub.value.usage
  return [
    {
      key: 'messages',
      label: 'AI messages',
      used: u.messages.used,
      limit: u.messages.limit,
      overage: u.messages.overage,
      overage_due_pesos: u.messages.overage_due_pesos,
      overage_rate: u.messages.overage_rate,
    },
    { key: 'documents', label: 'Documents uploaded', used: u.documents.used, limit: u.documents.limit },
    { key: 'cases', label: 'Active cases', used: u.active_cases.used, limit: u.active_cases.limit },
  ]
})

const priceLabel = computed(() => {
  const plan = sub.value?.plan
  if (!plan) return ''
  return sub.value?.interval === 'annual' ? plan.price_annual_label : plan.price_label
})

function formatPesos(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function limitLabel(limit: number | null) {
  return formatCount(limit)
}
</script>

<template>
  <div class="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
    <PageHeader
      title="Billing"
      description="Manage your subscription, payments, and usage."
    >
      <template #actions>
        <NuxtLink to="/pricing">
          <Button variant="outline">
            <SparklesIcon class="size-4" />
            Change plan
          </Button>
        </NuxtLink>
      </template>
    </PageHeader>

    <div v-if="confirmingPayment" class="mb-6">
      <Card>
        <CardContent class="flex items-center gap-3 py-6">
          <Loader2Icon class="size-5 animate-spin text-primary" />
          <div>
            <p class="text-sm font-medium">Confirming your payment…</p>
            <p class="text-xs text-muted-foreground">This can take a few seconds.</p>
          </div>
        </CardContent>
      </Card>
    </div>

    <div v-if="loading" class="space-y-6">
      <div class="h-40 rounded-xl border bg-muted/20" />
      <div class="h-64 rounded-xl border bg-muted/20" />
    </div>

    <template v-else-if="sub">
      <Card class="mb-6">
        <CardHeader>
          <div class="flex items-start justify-between gap-4">
            <div>
              <CardTitle class="flex items-center gap-2">
                {{ sub.plan?.name ?? 'No plan' }}
                <Badge :class="statusStyles[sub.status] ?? 'bg-muted text-muted-foreground'">
                  {{ statusLabel[sub.status] ?? sub.status }}
                </Badge>
              </CardTitle>
              <CardDescription v-if="sub.plan">
                {{ priceLabel }} per month · billed {{ sub.interval === 'annual' ? 'yearly' : 'monthly' }}
              </CardDescription>
            </div>
            <CreditCardIcon class="size-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent class="space-y-4 text-sm">
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Period</p>
              <p class="mt-1">{{ formatDate(sub.current_period_start) }} – {{ formatDate(sub.current_period_end) }}</p>
            </div>
            <div>
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
              <p class="mt-1">{{ statusLabel[sub.status] ?? sub.status }}</p>
            </div>
            <div>
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Payment method</p>
              <p class="mt-1">{{ gatewayLabel[sub.gateway] ?? sub.gateway }}</p>
            </div>
          </div>
          <div class="pt-2">
            <Button
              v-if="sub.status !== 'cancelled'"
              variant="outline"
              size="sm"
              class="text-destructive hover:text-destructive"
              :disabled="cancelling"
              @click="handleCancel"
            >
              <Loader2Icon v-if="cancelling" class="size-4 animate-spin" />
              Cancel subscription
            </Button>
            <p v-else class="text-sm text-muted-foreground">
              This subscription is cancelled. You can resubscribe anytime from the pricing page.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage this period</CardTitle>
          <CardDescription>Resets each billing cycle.</CardDescription>
        </CardHeader>
        <CardContent class="space-y-5">
          <div v-for="meter in meters" :key="meter.key">
            <div class="mb-1.5 flex items-center justify-between text-sm">
              <span>{{ meter.label }}</span>
              <span class="text-muted-foreground">
                {{ meter.used.toLocaleString() }} / {{ limitLabel(meter.limit) }}
              </span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-muted">
              <div
                class="h-full rounded-full transition-all"
                :class="isAtLimit(meter.used, meter.limit) ? 'bg-destructive' : limitPct(meter.used, meter.limit) > 80 ? 'bg-espresso' : 'bg-primary'"
                :style="{ width: `${limitPct(meter.used, meter.limit)}%` }"
              />
            </div>
            <p v-if="isAtLimit(meter.used, meter.limit)" class="mt-1 text-xs text-destructive">
              Limit reached — upgrade for more.
            </p>
            <p
              v-else-if="meter.overage && meter.overage > 0"
              class="mt-1 text-xs text-espresso dark:text-peach"
            >
              {{ meter.overage.toLocaleString() }} over the cap · &#8369;{{ formatPesos(meter.overage_due_pesos) }} due this cycle.
            </p>
          </div>
        </CardContent>
      </Card>
    </template>

    <template v-else>
      <Card>
        <CardContent class="flex flex-col items-center gap-4 py-16 text-center">
          <div class="flex size-12 items-center justify-center rounded-full bg-primary/10">
            <SparklesIcon class="size-6 text-primary" />
          </div>
          <div>
            <h2 class="text-lg font-semibold">No active subscription</h2>
            <p class="mt-1 max-w-sm text-sm text-muted-foreground">
              Choose a plan to keep unlimited access to your cases, documents, and AI assistant.
            </p>
          </div>
          <NuxtLink to="/pricing">
            <Button>
              <CheckIcon class="size-4" />
              View plans
            </Button>
          </NuxtLink>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
