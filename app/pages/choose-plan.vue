<script setup lang="ts">
import {
  ArrowRightIcon,
  CheckIcon,
  CircleAlertIcon,
  Loader2Icon,
  ShieldCheckIcon,
  XIcon,
} from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import type { BillingInterval, Plan } from '~/stores/billing'

definePageMeta({
  layout: 'minimal',
  middleware: ['auth'],
})

const auth = useAuthStore()
const billing = useBillingStore()
const route = useRoute()
const salesEmail = useRuntimeConfig().public.salesEmail

const loading = ref(true)
const error = ref('')
const processing = ref<'trial' | string | null>(null)
const billingInterval = ref<BillingInterval>(route.query.interval === 'annual' ? 'annual' : 'monthly')
const requestedPlan = typeof route.query.plan === 'string' ? route.query.plan : null

const paidPlans = computed(() => billing.plans.filter(plan => !plan.contact_sales))
const trialPlan = computed(() => billing.trialPlan)
/** Every column in the comparison table: the trial first, then the paid ladder. */
const cols = computed<Plan[]>(() => trialPlan.value ? [trialPlan.value, ...paidPlans.value] : [...paidPlans.value])
const currentSubscription = computed(() => billing.subscription)
const hasPaidAccess = computed(() => auth.user?.is_admin === true || (
  currentSubscription.value?.status === 'active' && !billing.onTrial
))

const activeInterval = computed<BillingInterval>(() => billingInterval.value)

function isTrial(plan: Plan): boolean {
  return plan.slug === 'trial'
}

function isPro(plan: Plan): boolean {
  return plan.slug === 'pro'
}

/**
 * Whether the column at this index is the highlighted one. Indexed rather than
 * passed a plan because the table's cells only know their position, and the
 * lookup can miss under `noUncheckedIndexedAccess`.
 */
function isProColumn(index: number): boolean {
  const plan = cols.value[index]

  return plan !== undefined && isPro(plan)
}

/**
 * A sales enquiry, pre-addressed for any future contact-only plan. The current
 * three-tier ladder is self-serve.
 */
function contactSalesHref(plan: Plan): string {
  return `mailto:${salesEmail}?subject=${encodeURIComponent(`${plan.name} plan enquiry`)}`
}

/** Centavos rendered as pesos, keeping decimals only when there are any. */
function peso(centavos: number): string {
  const value = centavos / 100

  return `₱${value.toLocaleString('en-PH', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

/** The yearly charge, mirroring the API's fallback when no annual price is set. */
function annualPrice(plan: Plan): number {
  if (billing.foundingPricing && plan.founding_price_annual !== null) return plan.founding_price_annual

  return listAnnualPrice(plan)
}

/** The yearly list price, before any founding-member discount. */
function listAnnualPrice(plan: Plan): number {
  return plan.price_annual || plan.price * 12
}

/** The monthly charge this account would pay: the founding price while it applies. */
function basePrice(plan: Plan): number {
  if (billing.foundingPricing && plan.founding_price !== null) return plan.founding_price

  return plan.price
}

/**
 * The regular per-month figure, struck through beside the founding price so
 * the discount is visible rather than asserted. Null when no discount applies.
 */
function listPriceFor(plan: Plan, interval: BillingInterval = activeInterval.value): string | null {
  if (!billing.foundingPricing || plan.contact_sales || !isIntervalAvailable(plan, interval)) return null

  return peso(interval === 'annual' ? listAnnualPrice(plan) / 12 : plan.price)
}

/** What one month costs on the given interval — annual spread over twelve. */
function monthlyPrice(plan: Plan, interval: BillingInterval): number {
  return interval === 'annual' ? annualPrice(plan) / 12 : basePrice(plan)
}

function isIntervalAvailable(plan: Plan, interval: BillingInterval): boolean {
  return !plan.annual_only || interval === 'annual'
}

/**
 * The headline figure. Annual plans are quoted per month so the two intervals
 * can be compared at a glance; the amount actually charged is stated
 * separately by `billedLabel`, never left to be inferred from this.
 */
function priceFor(plan: Plan, interval: BillingInterval = activeInterval.value): string {
  if (!isIntervalAvailable(plan, interval)) return 'Annual only'

  return peso(monthlyPrice(plan, interval))
}

function billedLabel(plan: Plan, interval: BillingInterval = activeInterval.value): string {
  if (!isIntervalAvailable(plan, interval)) return 'Available with annual billing'

  return peso(interval === 'annual' ? annualPrice(plan) : basePrice(plan))
}

/** What the annual interval saves against paying monthly for a year. */
function annualSavingsLabel(plan: Plan): string {
  return peso(basePrice(plan) * 12 - annualPrice(plan))
}

/**
 * Feature copy comes from the API, which is also the thing that enforces the
 * features — so a label here can never describe a capability the product does
 * not actually gate.
 */
function featureLabel(feature: string): string {
  const label = billing.featureCatalogue[feature]?.label ?? feature.replaceAll('_', ' ')

  return label.charAt(0).toUpperCase() + label.slice(1)
}

/**
 * A comparison-table cell: `true` renders a tick, `false` a cross, and a
 * string renders verbatim (the quantitative allowances carry their numbers).
 */
type Cell = boolean | string

const hasFeature = (plan: Plan, key: string): boolean => plan.features.includes(key)

/** A limit rendered as its number (with suffix) or "Unlimited". */
function limitValue(limit: number | null, suffix = ''): Cell {
  if (limit === null) return 'Unlimited'
  return `${limit.toLocaleString()}${suffix}`
}

/**
 * The monthly AI allowance, read off the spend budget the API enforces — a
 * plan without one is a contract tier, not an unlimited one.
 */
function usageCell(plan: Plan): Cell {
  if (plan.ai_budget_label === null) return 'By contract'
  return plan.included_seats > 1 ? `${plan.ai_budget_label}, team pool` : plan.ai_budget_label
}

/**
 * Seats as a cell: the number the price covers, and the add-on rate when the
 * plan sells one.
 */
function seatCell(plan: Plan): Cell {
  if (plan.contact_sales) return 'By contract'
  if (plan.seat_price_label === null) return `${plan.included_seats}`

  const seatPrice = billing.foundingPricing ? plan.founding_seat_price_label : plan.seat_price_label

  return `${plan.included_seats}, then ${seatPrice}`
}

/**
 * The comparison table, in three bands — the same rows as the pricing page,
 * so the two can never drift apart in what a plan carries.
 *
 * The allowance rows carry numbers because "12 / mo" tells a truth a tick
 * merely asserts. The capability rows below them are generated from the API's
 * feature catalogue rather than listed here, so a feature added to a plan
 * appears on this table without anyone remembering to add a row — and a row
 * can never describe a feature the API does not enforce. The service rows come
 * last and separately, because nothing refuses a request for lacking them.
 */
const tableRows = computed<{ label: string; cells: Cell[]; heading?: boolean }[]>(() => {
  const p = cols.value
  const catalogue = billing.featureCatalogue

  const rowsForGroup = (group: 'capability' | 'service') =>
    Object.entries(catalogue)
      .filter(([, entry]) => entry.group === group)
      .map(([key, entry]) => ({ label: entry.label, cells: p.map(pl => hasFeature(pl, key)) }))

  const serviceRows = rowsForGroup('service')

  return [
    { label: 'Active cases', cells: p.map(pl => limitValue(pl.limits.active_cases)) },
    { label: 'Document uploads', cells: p.map(pl => limitValue(pl.limits.documents_uploaded, ' / mo')) },
    { label: 'Monthly AI usage', cells: p.map(pl => usageCell(pl)) },
    { label: 'Seats', cells: p.map(pl => seatCell(pl)) },
    ...rowsForGroup('capability'),
    ...(serviceRows.length === 0
      ? []
      : [{ label: 'Delivered by our team', cells: p.map(() => '' as Cell), heading: true }, ...serviceRows]),
  ]
})

async function startTrial() {
  if (processing.value) return

  error.value = ''
  processing.value = 'trial'

  try {
    await billing.startFreeTrial()
    await navigateTo({ path: '/welcome', query: { next: '/chat' } })
  } catch (err) {
    error.value = parseApiError(err, 'Your free trial could not be started. Please try again.').message
  } finally {
    processing.value = null
  }
}

async function startPaidPlan(plan: Plan) {
  if (processing.value || plan.contact_sales) return
  if (!isIntervalAvailable(plan, billingInterval.value)) {
    error.value = `${plan.name} is available with annual billing only.`
    return
  }

  error.value = ''
  processing.value = plan.id

  try {
    const { checkout } = await billing.subscribe(plan.id, billingInterval.value)

    if (checkout.checkout_url) {
      window.location.href = checkout.checkout_url
      return
    }

    toast.success(`${plan.name} is ready`)
    await navigateTo({ path: '/welcome', query: { next: '/chat' } })
  } catch (err) {
    error.value = parseApiError(err, 'The payment page could not be prepared. Please try again.').message
  } finally {
    processing.value = null
  }
}

function goToApp() {
  navigateTo(auth.homePath())
}

onMounted(async () => {
  await Promise.all([
    billing.fetchPlans(true, true),
    billing.fetchSubscription(),
  ])
  loading.value = false
})
</script>

<template>
  <div class="relative isolate flex-1 overflow-hidden bg-background">
    <div aria-hidden="true" class="pointer-events-none absolute -right-40 -top-48 size-[34rem] rounded-full bg-peach/15 blur-3xl dark:bg-primary/10" />
    <div aria-hidden="true" class="pointer-events-none absolute -bottom-56 -left-48 size-[32rem] rounded-full bg-primary/10 blur-3xl" />

    <main class="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 sm:px-8 sm:py-14 lg:gap-12 lg:py-20">
      <header class="mx-auto flex max-w-2xl flex-col gap-4 text-center">
        <p class="mx-auto flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-forest dark:text-primary">
          <span class="h-px w-8 bg-forest/40 dark:bg-primary/40" aria-hidden="true" />
          Choose how to begin
          <span class="h-px w-8 bg-forest/40 dark:bg-primary/40" aria-hidden="true" />
        </p>
        <h1 class="font-heading text-3xl font-medium leading-[1.1] tracking-tight sm:text-5xl">
          Start with the work in front of you.
        </h1>
        <p class="text-base leading-relaxed text-muted-foreground sm:text-lg">
          Try Batayan without a card, or choose a paid plan when your practice is ready for more room.
        </p>
        <div class="mt-2 inline-flex w-fit items-center self-center rounded-full border bg-card p-1 text-sm">
          <button
            type="button"
            class="rounded-full px-3 py-1.5 transition-colors"
            :class="billingInterval === 'monthly' ? 'bg-muted font-medium shadow-sm' : 'text-muted-foreground'"
            @click="billingInterval = 'monthly'"
          >
            Monthly
          </button>
          <button
            type="button"
            class="rounded-full px-3 py-1.5 transition-colors"
            :class="billingInterval === 'annual' ? 'bg-muted font-medium shadow-sm' : 'text-muted-foreground'"
            @click="billingInterval = 'annual'"
          >
            Annual
            <span class="ml-1 text-xs text-forest dark:text-primary">2 months free</span>
          </button>
        </div>
        <FoundingOfferBanner
          v-if="billing.foundingPricing && billing.foundingOffer?.open"
          :offer="billing.foundingOffer"
        />
      </header>

      <div v-if="loading" class="surface h-[32rem] animate-pulse" />

      <template v-else>
        <div
          v-if="error"
          role="alert"
          class="mx-auto flex w-full max-w-2xl items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <CircleAlertIcon class="mt-px size-4 shrink-0" />
          <span>{{ error }}</span>
        </div>

        <div
          v-if="hasPaidAccess"
          class="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 rounded-2xl border border-primary/25 bg-primary/5 p-6 text-center sm:p-8"
        >
          <ShieldCheckIcon class="size-8 text-primary" />
          <div class="flex flex-col gap-1.5">
            <h2 class="font-heading text-xl font-medium tracking-tight">Your workspace is ready.</h2>
            <p class="text-sm leading-relaxed text-muted-foreground">
              {{ billing.onTrial ? 'Your free trial is active.' : 'You already have an active subscription.' }}
            </p>
          </div>
          <Button class="gap-2" @click="goToApp">
            Go to Batayan
            <ArrowRightIcon class="size-4" />
          </Button>
        </div>

        <!--
          The same comparison table as the pricing page: plans across the top,
          features down the left, and a tick or cross in every cell. The trial
          rides as the first column — limited Standard, 14 days, no card — and
          the Pro column inverts onto pine end to end.
        -->
        <div v-else class="surface overflow-x-auto">
          <table class="w-full min-w-[64rem] border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                <th scope="col" class="sticky left-0 z-20 border-b border-border bg-muted/50 p-5 align-bottom">
                  <span class="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Plans &amp; features
                  </span>
                </th>
                <th
                  v-for="plan in cols"
                  :key="plan.id"
                  scope="col"
                  :class="[
                    isPro(plan)
                      ? 'border-b border-cream/15 bg-pine p-5 align-bottom text-cream'
                      : 'border-b border-border p-5 align-bottom',
                    requestedPlan === plan.id ? 'outline outline-2 -outline-offset-2 outline-primary' : '',
                  ]"
                >
                  <div class="flex min-h-[1.5rem] items-center justify-start">
                    <span
                      v-if="isPro(plan)"
                      class="rounded-full bg-forest px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-cream"
                    >
                      Most popular
                    </span>
                    <span
                      v-else-if="isTrial(plan)"
                      class="rounded-full bg-muted px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                    >
                      No card required
                    </span>
                  </div>
                  <h3 class="mt-3 font-heading text-xl font-medium tracking-tight" :class="isPro(plan) ? 'text-cream' : 'text-foreground'">
                    {{ isTrial(plan) ? 'Free trial' : plan.name }}
                  </h3>
                  <p class="mt-1 text-[0.8125rem] leading-snug" :class="isPro(plan) ? 'text-cream/70' : 'text-muted-foreground'">
                    <template v-if="isTrial(plan)">
                      limited Standard access
                    </template>
                    <template v-else-if="plan.contact_sales">
                      For organizations with their own terms
                    </template>
                    <template v-else-if="plan.annual_only && activeInterval === 'monthly'">
                      annual billing only
                    </template>
                    <template v-else-if="activeInterval === 'annual'">
                      per month, billed yearly
                    </template>
                    <template v-else>
                      per month
                    </template>
                  </p>

                  <p
                    v-if="!isTrial(plan) && listPriceFor(plan)"
                    class="mt-5 text-[0.8125rem] leading-none line-through"
                    :class="isPro(plan) ? 'text-cream/50' : 'text-muted-foreground'"
                  >
                    <span class="sr-only">Regular price </span>{{ listPriceFor(plan) }}
                  </p>
                  <div
                    class="flex items-end justify-start gap-1.5"
                    :class="!isTrial(plan) && listPriceFor(plan) ? 'mt-1.5' : 'mt-5'"
                  >
                    <span
                      class="font-heading text-[1.75rem] font-medium leading-none tracking-tight"
                      :class="isPro(plan) ? 'text-cream' : 'text-foreground'"
                    >
                      {{ isTrial(plan) ? '₱0' : plan.contact_sales ? 'Custom' : priceFor(plan) }}
                    </span>
                    <span
                      v-if="!isTrial(plan) && !plan.contact_sales && (!plan.annual_only || activeInterval === 'annual')"
                      class="pb-0.5 text-[0.8125rem] leading-tight"
                      :class="isPro(plan) ? 'text-cream/60' : 'text-muted-foreground'"
                    >
                      /month
                    </span>
                  </div>
                  <p class="mt-2 text-[0.75rem] leading-snug" :class="isPro(plan) ? 'text-cream/60' : 'text-muted-foreground'">
                    <template v-if="isTrial(plan)">
                      Free for 14 days · no automatic charge
                    </template>
                    <template v-else-if="plan.contact_sales">
                      Priced per organization · billed by invoice
                    </template>
                    <template v-else-if="plan.annual_only && activeInterval === 'monthly'">
                      Available with annual billing
                    </template>
                    <template v-else-if="activeInterval === 'annual'">
                      {{ billedLabel(plan) }} billed yearly
                      <br />
                      <span :class="isPro(plan) ? 'text-peach' : 'text-forest dark:text-primary'">
                        You save {{ annualSavingsLabel(plan) }} a year
                      </span>
                    </template>
                    <template v-else>
                      {{ billedLabel(plan) }} billed monthly
                    </template>
                  </p>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in tableRows" :key="row.label">
                <th
                  scope="row"
                  class="sticky left-0 z-10 border-b border-border/60 bg-card px-5 py-3.5 text-[0.8125rem]"
                  :class="row.heading
                    ? 'pt-7 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground'
                    : 'font-medium text-foreground/80'"
                >
                  {{ row.label }}
                </th>
                <td
                  v-for="(value, i) in row.cells"
                  :key="i"
                  class="border-b px-5 py-3.5 text-center"
                  :class="isProColumn(i) ? 'border-cream/15 bg-pine' : 'border-border/60'"
                >
                  <CheckIcon
                    v-if="value === true"
                    class="mx-auto size-4"
                    :class="isProColumn(i) ? 'text-peach' : 'text-forest dark:text-primary'"
                  />
                  <XIcon
                    v-else-if="value === false"
                    class="mx-auto size-4"
                    :class="isProColumn(i) ? 'text-cream/40' : 'text-muted-foreground/50'"
                  />
                  <span
                    v-else
                    class="whitespace-nowrap text-[0.8125rem] font-medium tracking-tight"
                    :class="isProColumn(i) ? 'text-cream' : 'text-foreground'"
                  >
                    {{ value }}
                  </span>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" class="sticky left-0 z-10 border-t border-border/60 bg-card px-5 py-5" />
                <td
                  v-for="plan in cols"
                  :key="plan.id"
                  class="border-t px-5 py-5 text-center"
                  :class="isPro(plan) ? 'border-cream/15 bg-pine' : 'border-border/60'"
                >
                  <template v-if="isTrial(plan)">
                    <Button
                      variant="outline"
                      class="h-11 w-full max-w-[12rem] gap-2"
                      :disabled="processing !== null"
                      @click="billing.onTrial ? goToApp() : startTrial()"
                    >
                      <Loader2Icon v-if="processing === 'trial'" class="size-4 animate-spin" />
                      {{ processing === 'trial' ? 'Starting…' : billing.onTrial ? 'Go to your workspace' : 'Start free trial' }}
                    </Button>
                    <p v-if="billing.onTrial && billing.trialDaysRemaining !== null" class="mt-2 text-xs text-muted-foreground">
                      {{ billing.trialDaysRemaining }} days left · no automatic charge
                    </p>
                  </template>
                  <Button
                    v-else-if="plan.contact_sales"
                    as="a"
                    variant="outline"
                    class="h-11 w-full max-w-[12rem]"
                    :href="contactSalesHref(plan)"
                  >
                    Contact sales
                  </Button>
                  <Button
                    v-else
                    class="h-11 w-full max-w-[12rem] gap-2"
                    :variant="isPro(plan) ? 'default' : 'outline'"
                    :class="isPro(plan) ? 'bg-cream text-forest hover:bg-cream/90' : ''"
                    :disabled="processing !== null || !isIntervalAvailable(plan, billingInterval)"
                    @click="startPaidPlan(plan)"
                  >
                    <Loader2Icon v-if="processing === plan.id" class="size-4 animate-spin" />
                    {{ processing === plan.id
                      ? 'Preparing checkout…'
                      : !isIntervalAvailable(plan, billingInterval) ? 'Annual billing required' : `Choose ${plan.name}` }}
                  </Button>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <footer class="mx-auto flex max-w-2xl flex-col items-center gap-2 text-center text-xs leading-relaxed text-muted-foreground">
          <p class="flex items-center gap-1.5"><ShieldCheckIcon class="size-3.5" /> Secure checkout. Cancel any time.</p>
          <p>All prices in Philippine pesos. Allowances reset monthly — an exhausted allowance stops the turn, it never grows the bill.</p>
        </footer>
      </template>
    </main>
  </div>
</template>
