<script setup lang="ts">
import { CheckIcon, CreditCardIcon, Loader2Icon, MinusIcon, PlusIcon, SparklesIcon, UsersIcon } from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import { useBillingStore, isAtLimit, limitPct } from '~/stores/billing'

definePageMeta({
  middleware: ['auth'],
  layout: 'default',
})

const billing = useBillingStore()
const org = useOrganizationStore()
const auth = useAuthStore()
const route = useRoute()

const loading = ref(true)
const confirmingPayment = ref(false)
const cancelling = ref(false)
const seatQuantity = ref(1)
const seatBusy = ref(false)
const confirmSeatPurchase = ref(false)

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
  await Promise.all([
    billing.fetchPlans(),
    billing.fetchSubscription(),
    // A solo account has no organization and is refused here; that is an
    // answer, not a failure, and the seat card simply stays hidden.
    org.fetchOrganization().catch(() => null),
  ])
  loading.value = false

  // Checkouts return to `/welcome` now. This stays for sessions that were
  // already in flight against the old success URL, which still point here.
  if (route.query.paymongo === 'return' || route.query.lemonsqueezy === 'return') {
    confirmingPayment.value = true
    const active = await billing.waitForActiveSubscription().catch(() => false)
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

/**
 * A contract-priced plan is invoiced outside the app, so the card states the
 * arrangement rather than a per-month figure the subscription does not carry.
 */
const billingSummary = computed(() => {
  if (sub.value?.plan?.contact_sales) {
    return 'Priced by contract · invoiced by your account manager'
  }

  return `${priceLabel.value} per month · billed ${sub.value?.interval === 'annual' ? 'yearly' : 'monthly'}`
})

function formatPesos(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function limitLabel(limit: number | null) {
  return formatCount(limit)
}

/**
 * Seats are only sellable when the plan prices them, so the card is offered on
 * exactly the plans the API would accept a purchase for. A plan without a seat
 * price is not "zero seats" — it is a plan that sells none, and the answer
 * there is a different plan rather than a quantity box.
 */
const sellsSeats = computed(() => sub.value?.plan?.seat_price != null)

const seats = computed(() => sub.value?.seats ?? null)
const seatsUsed = computed(() => org.organization?.seats.used ?? 0)
const seatsFree = computed(() => Math.max(0, (seats.value?.purchased ?? 0) - seatsUsed.value))

/** Only admins may change the seat count; the API enforces the same rule. */
const canManageSeats = computed(() => sellsSeats.value && org.isManager && sub.value?.status !== 'cancelled')

/**
 * The subscription carries a per-seat price only once it has been set on the
 * row — subscriptions predating seat pricing, and ones created without it,
 * report null. The plan's own seat price is what the next seat actually costs
 * there, so it is the fallback rather than zero, which would quote a free seat.
 */
const seatPricePesos = computed(
  () => (seats.value?.price_per_seat ?? sub.value?.plan?.seat_price ?? 0) / 100,
)

/** What the requested change costs, so the button is not a blind commitment. */
const seatChargePesos = computed(() => seatPricePesos.value * Math.max(1, seatQuantity.value))

/** Who the charge lands on — the workspace when there is one, else the signed-in account. */
const billedAccount = computed(
  () => org.organization?.name ?? auth.user?.organization_name ?? auth.user?.email ?? 'your account',
)

/**
 * Buying a seat spends the organization's money, so the button asks rather
 * than charges: the dialog names the account being billed and the amount it
 * adds, and the request only leaves once that is confirmed.
 */
function requestSeatPurchase() {
  if (seatQuantity.value < 1) return
  confirmSeatPurchase.value = true
}

async function handleAddSeats() {
  seatBusy.value = true
  try {
    const purchased = seatQuantity.value
    await billing.addSeats(purchased)
    await org.fetchOrganization().catch(() => null)
    confirmSeatPurchase.value = false
    toast.success(`Added ${purchased} seat${purchased === 1 ? '' : 's'}`)
    seatQuantity.value = 1
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not add seats')
  } finally {
    seatBusy.value = false
  }
}

async function handleRemoveSeats() {
  seatBusy.value = true
  try {
    await billing.removeSeats(seatQuantity.value)
    await org.fetchOrganization().catch(() => null)
    toast.success(`Removed ${seatQuantity.value} seat${seatQuantity.value === 1 ? '' : 's'}`)
    seatQuantity.value = 1
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not remove seats')
  } finally {
    seatBusy.value = false
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
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
                {{ billingSummary }}
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

      <Card v-if="sellsSeats" class="mb-6">
        <CardHeader>
          <div class="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Seats</CardTitle>
              <CardDescription>
                &#8369;{{ formatPesos(seatPricePesos) }} per seat · next invoice
                &#8369;{{ formatPesos(seats?.next_invoice_pesos ?? 0) }}
              </CardDescription>
            </div>
            <UsersIcon class="size-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent class="space-y-4 text-sm">
          <div class="grid gap-4 sm:grid-cols-3">
            <div>
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Purchased</p>
              <p class="mt-1 text-lg font-semibold">{{ formatCount(seats?.purchased ?? 0) }}</p>
            </div>
            <div>
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Used</p>
              <p class="mt-1 text-lg font-semibold">{{ formatCount(seatsUsed) }}</p>
            </div>
            <div>
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Free</p>
              <p class="mt-1 text-lg font-semibold" :class="seatsFree === 0 ? 'text-destructive' : ''">
                {{ formatCount(seatsFree) }}
              </p>
            </div>
          </div>

          <div v-if="canManageSeats" class="flex flex-wrap items-end gap-3 border-t pt-4">
            <div class="w-24">
              <Label for="seat-quantity" class="text-xs uppercase tracking-wide text-muted-foreground">
                Quantity
              </Label>
              <Input
                id="seat-quantity"
                v-model.number="seatQuantity"
                type="number"
                min="1"
                max="100"
                class="mt-1.5"
              />
            </div>
            <Button :disabled="seatBusy || seatQuantity < 1" @click="requestSeatPurchase">
              <Loader2Icon v-if="seatBusy" class="size-4 animate-spin" />
              <PlusIcon v-else class="size-4" />
              Purchase seats
            </Button>
            <Button
              variant="outline"
              :disabled="seatBusy || seatQuantity < 1 || (seats?.purchased ?? 0) < 1"
              @click="handleRemoveSeats"
            >
              <MinusIcon class="size-4" />
              Remove seats
            </Button>
          </div>
          <p v-if="canManageSeats" class="text-xs text-muted-foreground">
            Adds &#8369;{{ formatPesos(seatChargePesos) }} to your next invoice. Seats you remove cannot drop
            below the members already using them.
          </p>
          <p v-else-if="sub.status === 'cancelled'" class="text-sm text-muted-foreground">
            Seat changes are unavailable on a cancelled subscription.
          </p>
          <p v-else class="text-sm text-muted-foreground">
            Only organization owners and admins can change the seat count.
          </p>
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

    <AlertDialog v-model:open="confirmSeatPurchase">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Purchase {{ seatQuantity }} seat{{ seatQuantity === 1 ? '' : 's' }}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This charges <span class="font-medium text-foreground">{{ billedAccount }}</span>
            an extra &#8369;{{ formatPesos(seatChargePesos) }} per cycle, billed to
            {{ gatewayLabel[sub?.gateway ?? ''] ?? sub?.gateway }} as
            {{ auth.user?.email }}. The seats are available immediately and appear on your
            next invoice.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="seatBusy">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction :disabled="seatBusy" @click.prevent="handleAddSeats">
            <Loader2Icon v-if="seatBusy" class="size-4 animate-spin" />
            {{ seatBusy ? 'Purchasing…' : 'Confirm purchase' }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
