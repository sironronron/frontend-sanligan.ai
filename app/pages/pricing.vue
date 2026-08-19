<script setup lang="ts">
import { ArrowLeftIcon, CheckIcon, CircleAlertIcon, ClockIcon, Loader2Icon, SparklesIcon, XIcon } from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import { useBillingStore, type BillingInterval, type Plan } from '~/stores/billing'
import type { OrgInvitation } from '~/stores/organization'

definePageMeta({
  layout: 'minimal',
  middleware: ['suspended'],
})

const billing = useBillingStore()
const auth = useAuthStore()
const organization = useOrganizationStore()
const router = useRouter()
const salesEmail = useRuntimeConfig().public.salesEmail

const plans = ref<Plan[]>([])
const loading = ref(true)

const billingInterval = ref<BillingInterval>('monthly')
const selectedPlan = ref<Plan | null>(null)
const selectedInterval = ref<BillingInterval>('monthly')
const processing = ref(false)

const currentPlanId = computed(() => billing.subscription?.plan?.id ?? null)
// Paid only, deliberately: a trial grants access but has no gateway
// subscription behind it, so it must not offer "switch plan" — a trial user
// subscribes for the first time like anyone else.
const hasActiveSubscription = computed(() => {
  const sub = billing.subscription
  return !!sub && sub.status === 'active'
})

/**
 * The invitations waiting for this user, which the paywall answers with
 * instead of a price list. Someone invited to a colleague's workspace is not
 * meant to buy their own plan — being sent to /pricing by the subscription
 * guard is the one moment they are most likely to do exactly that, so the
 * invitation is offered here rather than only in the emailed link they may no
 * longer have.
 */
const pendingInvites = computed(() => organization.pendingInvites)

const pendingInvite = computed(() => pendingInvites.value[0] ?? null)

// Set when the reader asks for the plans anyway — an invitation is an offer,
// not a redirect, and they may prefer a workspace of their own.
const browsingPlans = ref(false)

const showInvite = computed(() => pendingInvite.value !== null && !browsingPlans.value)

// Per-invite, so one card's spinner cannot appear on another's button when
// several workspaces are waiting.
const joiningId = ref<string | null>(null)
const joinError = ref('')

/** What the seat covers, said once above the invitations rather than per card. */
const inviteBenefits = [
  'Your seat is paid for by the workspace — nothing to subscribe to',
  'The team\'s cases, documents, and templates, shared',
  'Your own research and drafts, kept to your account',
]

/** A workspace monogram: up to two initials, for the card's avatar. */
function orgInitials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)

  if (words.length === 0) return 'B'

  return words.slice(0, 2).map(word => word[0]?.toUpperCase() ?? '').join('')
}

function orgName(invite: OrgInvitation): string {
  return invite.organization?.name ?? 'A Batayan workspace'
}

/** Names the workspace when there is only one — a heading worth reading. */
const inviteHeadline = computed(() => {
  const invite = pendingInvite.value

  if (!invite || pendingInvites.value.length > 1) return 'You have been invited to these workspaces'

  return `Join ${orgName(invite)}`
})

/**
 * How long is left to accept, in the plain terms the reader cares about. An
 * exact date reads as bureaucracy on something that lapses in a week.
 */
function inviteExpiry(iso: string | null): string {
  if (!iso) return ''

  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)

  if (days <= 0) return 'Expires today'
  if (days === 1) return 'Expires tomorrow'

  return `Expires in ${days} days`
}

async function joinWorkspace(invite: OrgInvitation) {
  if (joiningId.value) return

  joiningId.value = invite.id
  joinError.value = ''

  try {
    await organization.acceptPendingInvite(invite.id)
    // The seat carries the organization's subscription, so the guard that sent
    // the user here has to be re-asked before routing back into the app.
    await billing.fetchSubscription()
    await navigateTo(auth.kycCompleted ? auth.homePath() : '/onboarding')
  } catch (err) {
    joinError.value = parseApiError(err, 'This invitation could not be accepted.').message
  } finally {
    joiningId.value = null
  }
}

/**
 * The payment gateway is being finalised, so the price list is shown but
 * blocked: it is blurred underneath an overlay that still lets someone with a
 * referral code in. Keeping the table visible (rather than hidden) reassures
 * the reader the pricing exists; the blur makes clear it is not live yet.
 */
const gatewayFinalizing = ref(true)
const referralCode = ref('')
const referralError = ref('')
const redeemingReferral = ref(false)

const canRedeemReferral = computed(
  () => referralCode.value.trim().length > 0 && !redeemingReferral.value,
)

async function submitReferralCode() {
  if (!canRedeemReferral.value) return

  referralError.value = ''
  redeemingReferral.value = true

  try {
    await billing.redeemTrialCode(referralCode.value.trim())
    await navigateTo({ path: '/welcome', query: { next: '/chat' } })
  } catch (err) {
    referralError.value = parseApiError(err, 'That code could not be redeemed.').message
  } finally {
    redeemingReferral.value = false
  }
}

const onTrial = computed(() => billing.subscription?.trial.on_trial === true)
const trialDaysRemaining = computed(() => billing.subscription?.trial.days_remaining ?? null)

// A trial ends on whichever runs out first, the days or the messages, so the
// banner leads with whichever is closer rather than always counting days.
const trialMessagesLeft = computed(() => {
  const meter = billing.subscription?.usage.messages
  if (!meter || meter.limit === null) return null
  return Math.max(0, meter.limit - meter.used)
})

const trialHeadline = computed(() => {
  const days = trialDaysRemaining.value
  const messages = trialMessagesLeft.value

  if (messages !== null && (days === null || messages <= days * 10)) {
    return `${messages} ${messages === 1 ? 'message' : 'messages'} left`
  }

  return `${days} ${days === 1 ? 'day' : 'days'} left`
})

const activeInterval = computed<BillingInterval>(() =>
  hasActiveSubscription.value
    ? (billing.subscription?.interval ?? 'monthly')
    : billingInterval.value,
)

/**
 * A Business enquiry, pre-addressed. The plan carries no list price, so the
 * column sends the reader to a conversation rather than to checkout.
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
  return plan.price_annual || plan.price * 12
}

/** What one month costs on the given interval — annual spread over twelve. */
function monthlyPrice(plan: Plan, interval: BillingInterval): number {
  return interval === 'annual' ? annualPrice(plan) / 12 : plan.price
}

/**
 * The headline figure. Annual plans are quoted per month so the two intervals
 * can be compared at a glance; the amount actually charged is stated
 * separately by `billedLabel`, never left to be inferred from this.
 */
function priceFor(plan: Plan, interval: BillingInterval = activeInterval.value) {
  return peso(monthlyPrice(plan, interval))
}

/** The total charged when checkout completes, for the given interval. */
function billedAmount(plan: Plan, interval: BillingInterval): number {
  return interval === 'annual' ? annualPrice(plan) : plan.price
}

function billedLabel(plan: Plan, interval: BillingInterval = activeInterval.value) {
  return peso(billedAmount(plan, interval))
}

/** What the annual interval saves against paying monthly for a year. */
function annualSavingsLabel(plan: Plan) {
  return peso(plan.price * 12 - annualPrice(plan))
}

function isPro(plan: Plan) {
  return plan.slug === 'pro'
}

/**
 * Whether the column at this index is the highlighted one. Indexed rather than
 * passed a plan because the table's cells only know their position, and the
 * lookup can miss under `noUncheckedIndexedAccess`.
 */
function isProColumn(index: number) {
  const plan = plans.value[index]

  return plan !== undefined && isPro(plan)
}

/**
 * Feature copy comes from the API, which is also the thing that enforces the
 * features — so a label here can never describe a capability the product does
 * not actually gate, which is what the hand-kept map it replaced had drifted
 * into.
 */
function featureLabel(feature: string): string {
  const label = billing.featureCatalogue[feature]?.label ?? feature.replaceAll('_', ' ')

  return label.charAt(0).toUpperCase() + label.slice(1)
}

const planLimits = (plan: Plan) => [
  plan.limits.active_cases === null ? 'Unlimited active cases' : `${plan.limits.active_cases} active cases`,
  plan.limits.documents_uploaded === null
    ? 'Unlimited document uploads'
    : `${plan.limits.documents_uploaded} document uploads/mo`,
  // Allowances are counted per seat, so a multi-seat plan has to say so — "300
  // AI messages" on a three-seat plan reads as a shared pool it is not.
  plan.limits.messages_used === null
    ? 'Unlimited AI messages'
    : `${plan.limits.messages_used} AI messages/mo${plan.included_seats > 1 ? ' per seat' : ''}`,
  // Only meaningful against a cap: an unlimited allowance can neither run out
  // nor spill into overage, so the line is dropped rather than claiming a cap.
  ...(plan.limits.messages_used === null
    ? []
    : [plan.overage_price === null ? 'No overage — hard message cap' : `Overage ${plan.overage_label}/msg`]),
  ...seatLines(plan),
]

/**
 * What the price covers in people, and what one more costs. Silent on a
 * single-seat plan, where "1 seat included" only raises a question the plan
 * has no answer to.
 */
function seatLines(plan: Plan): string[] {
  if (plan.included_seats <= 1) return []

  return [
    `${plan.included_seats} seats included`,
    ...(plan.seat_price_label === null ? [] : [`Extra seats ${plan.seat_price_label}/mo each`]),
  ]
}

function isCurrent(plan: Plan) {
  return currentPlanId.value === plan.id
}

/**
 * A comparison-table cell: `true` renders a tick, `false` a cross, and a
 * string renders verbatim (the quantitative allowances carry their numbers).
 */
type Cell = boolean | string

const hasFeature = (plan: Plan, key: string) => plan.features.includes(key)

/** A limit rendered as its number (with suffix) or "Unlimited". */
function limitValue(limit: number | null, suffix = ''): Cell {
  if (limit === null) return 'Unlimited'
  return `${limit.toLocaleString()}${suffix}`
}

/**
 * What happens past a plan's message allowance. An unlimited plan never runs
 * out (dash); a capped one stops you (Capped); the rest bill overage.
 */
function overageCell(plan: Plan): Cell {
  if (plan.limits.messages_used === null) return '—'
  if (plan.overage_price === null) return 'Capped'
  return `${plan.overage_label} each`
}

/**
 * Seats as a cell: the number the price covers, and the add-on rate when the
 * plan sells one.
 */
function seatCell(plan: Plan): Cell {
  if (plan.contact_sales) return 'By contract'
  if (plan.seat_price_label === null) return `${plan.included_seats}`

  return `${plan.included_seats}, then ${plan.seat_price_label}`
}

/**
 * The comparison table, in three bands.
 *
 * The allowance rows carry numbers because "10 / mo" tells a truth a tick
 * merely asserts. The capability rows below them are generated from the API's
 * feature catalogue rather than listed here, so a feature added to a plan
 * appears on this table without anyone remembering to add a row — and a row
 * can never describe a feature the API does not enforce. The service rows come
 * last and separately, because nothing refuses a request for lacking them.
 */
const tableRows = computed<{ label: string; cells: Cell[]; heading?: boolean }[]>(() => {
  const p = plans.value
  const catalogue = billing.featureCatalogue

  const rowsForGroup = (group: 'capability' | 'service') =>
    Object.entries(catalogue)
      .filter(([, entry]) => entry.group === group)
      .map(([key, entry]) => ({ label: entry.label, cells: p.map(pl => hasFeature(pl, key)) }))

  const serviceRows = rowsForGroup('service')

  return [
    { label: 'Active cases', cells: p.map(pl => limitValue(pl.limits.active_cases)) },
    { label: 'Document uploads', cells: p.map(pl => limitValue(pl.limits.documents_uploaded, ' / mo')) },
    { label: 'AI messages (per seat)', cells: p.map(pl => limitValue(pl.limits.messages_used, ' / mo')) },
    { label: 'Extra AI messages', cells: p.map(pl => overageCell(pl)) },
    { label: 'Seats', cells: p.map(pl => seatCell(pl)) },
    ...rowsForGroup('capability'),
    ...(serviceRows.length === 0
      ? []
      : [{ label: 'Delivered by our team', cells: p.map(() => '' as Cell), heading: true }, ...serviceRows]),
  ]
})

function choose(plan: Plan) {
  if (isCurrent(plan)) return
  if (!auth.user) {
    router.push({ path: '/register', query: { plan: plan.id, interval: billingInterval.value } })
    return
  }
  selectedPlan.value = plan
  selectedInterval.value = billingInterval.value
}

function handleChoose(plan: Plan) {
  if (isCurrent(plan) || plan.contact_sales) return
  if (hasActiveSubscription.value) {
    switchPlanNow(plan)
    return
  }
  choose(plan)
}

function back() {
  selectedPlan.value = null
  processing.value = false
}

function switchPlanNow(plan: Plan) {
  if (!hasActiveSubscription.value) return
  processing.value = true
  billing
    .changePlan(plan.id)
    .then(() => {
      toast.success(`You're now on the ${plan.name} plan`)
      navigateTo('/settings/billing')
    })
    .catch((err: any) => {
      toast.error(err?.data?.message ?? 'Could not switch plans')
    })
    .finally(() => {
      processing.value = false
    })
}

async function handleCheckout() {
  if (!selectedPlan.value || processing.value) return

  processing.value = true
  try {
    const { checkout } = await billing.subscribe(selectedPlan.value.id, selectedInterval.value)

    if (checkout.checkout_url) {
      window.location.href = checkout.checkout_url
      return
    }

    toast.error('The payment page could not be prepared. Please try again.')
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Payment could not be completed')
  } finally {
    processing.value = false
  }
}

onMounted(async () => {
  await Promise.all([billing.fetchPlans(), billing.fetchSubscription(), auth.initialized ? Promise.resolve() : auth.fetchUser()])

  // Only after the user is known, and only for someone who could still join
  // one: a signed-in account with no workspace of its own.
  if (auth.user && !auth.hasOrganization) {
    await organization.fetchPendingInvites()
  }

  plans.value = billing.plans
  loading.value = false
})
</script>

<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
    <!--
      One skeleton for the whole page, because until the invitations are known
      it is not settled *which* page this is — showing the plans first would
      flash a price list at someone who has a seat waiting.
    -->
    <template v-if="loading">
      <div class="surface h-[32rem] animate-pulse" />
    </template>

    <!--
      An invitation stands in for the whole price list: the reader is being
      offered a seat someone else pays for, and a table of plans next to it
      would only invite them to buy one they do not need.
    -->
    <template v-else-if="showInvite">
      <div class="mx-auto max-w-lg">
        <div class="mb-8 text-center">
          <p class="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-forest dark:text-primary">
            <span class="h-px w-8 bg-forest opacity-40 dark:bg-primary" aria-hidden="true" />
            {{ pendingInvites.length > 1 ? 'Invitations' : 'Invitation' }}
            <span class="h-px w-8 bg-forest opacity-40 dark:bg-primary" aria-hidden="true" />
          </p>
          <h1 class="mx-auto mt-3 font-heading text-2xl font-medium leading-[1.15] tracking-tight sm:text-3xl">
            {{ inviteHeadline }}
          </h1>
          <p class="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
            A seat is waiting for you, so there is no plan to buy.
          </p>
        </div>

        <div
          v-if="joinError"
          role="alert"
          class="mb-5 flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
        >
          <CircleAlertIcon class="mt-px size-4 shrink-0" />
          <span>{{ joinError }}</span>
        </div>

        <!--
          One card per waiting invitation. The workspace leads on a pine band,
          the way the Pro column does on the table below: the thing being
          offered should look like the thing worth taking.
        -->
        <ul class="space-y-4">
          <li v-for="invite in pendingInvites" :key="invite.id" class="surface overflow-hidden">
            <div class="flex items-center gap-4 bg-pine px-5 py-5 text-cream sm:px-6">
              <span
                aria-hidden="true"
                class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-cream/10 font-heading text-lg font-medium tracking-tight text-peach"
              >
                {{ orgInitials(invite.organization?.name) }}
              </span>
              <div class="min-w-0">
                <p class="truncate font-heading text-lg font-medium tracking-tight">
                  {{ orgName(invite) }}
                </p>
                <p class="mt-0.5 truncate text-sm text-cream/70">
                  <template v-if="invite.invited_by">
                    Invited by {{ invite.invited_by.name }}
                  </template>
                  <template v-else>
                    Invited to {{ invite.email }}
                  </template>
                </p>
              </div>
            </div>

            <div class="space-y-4 px-5 py-5 sm:px-6">
              <ul class="space-y-2.5">
                <li v-for="benefit in inviteBenefits" :key="benefit" class="flex items-start gap-2.5 text-sm">
                  <CheckIcon class="mt-0.5 size-4 shrink-0 text-forest dark:text-primary" />
                  <span class="text-foreground/80">{{ benefit }}</span>
                </li>
              </ul>

              <Button class="w-full" :disabled="joiningId !== null" @click="joinWorkspace(invite)">
                <Loader2Icon v-if="joiningId === invite.id" class="size-4 animate-spin" />
                {{ joiningId === invite.id ? 'Joining…' : 'Accept and join' }}
              </Button>

              <p v-if="invite.expires_at" class="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <ClockIcon class="size-3.5" />
                {{ inviteExpiry(invite.expires_at) }}
              </p>
            </div>
          </li>
        </ul>

        <p class="mt-8 text-center text-sm text-muted-foreground">
          Setting up a practice of your own instead?
          <button
            type="button"
            class="font-medium text-primary hover:underline disabled:opacity-60"
            :disabled="joiningId !== null"
            @click="browsingPlans = true"
          >
            See the plans
          </button>
        </p>
      </div>
    </template>

    <template v-else-if="!selectedPlan">
      <div v-if="pendingInvite" class="mb-6 flex justify-center">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          @click="browsingPlans = false"
        >
          <ArrowLeftIcon class="size-4" />
          Back to your invitation
        </button>
      </div>
      <div v-else-if="auth.user && (hasActiveSubscription || onTrial)" class="mb-6 flex justify-center">
        <NuxtLink
          to="/chat"
          class="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeftIcon class="size-4" />
          Back to app
        </NuxtLink>
      </div>
      <div
        v-if="onTrial"
        class="mx-auto mb-8 flex max-w-md items-center justify-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-4 py-2.5 text-sm"
      >
        <SparklesIcon class="size-4 shrink-0 text-primary" />
        <span>
          <span class="font-medium">{{ trialHeadline }}</span>
          on your free trial. Subscribe any time to keep your workspace.
        </span>
      </div>

      <div class="mb-8 text-center">
        <p class="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-forest dark:text-primary">
          <span class="h-px w-8 bg-forest opacity-40 dark:bg-primary" aria-hidden="true" />
          Pricing
          <span class="h-px w-8 bg-forest opacity-40 dark:bg-primary" aria-hidden="true" />
        </p>
        <h1 class="mx-auto mt-3 max-w-2xl font-heading text-2xl font-medium leading-[1.15] tracking-tight sm:text-3xl">
          Simple pricing for your practice
        </h1>
        <p class="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Pay per account. Cancel or switch plans any time. Cards and Maya accepted.
        </p>
        <div v-if="!hasActiveSubscription" class="mt-6 inline-flex items-center rounded-full border bg-muted/40 p-1 text-sm">
          <button
            type="button"
            class="rounded-full px-4 py-1.5 transition-colors"
            :class="billingInterval === 'monthly' ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground'"
            @click="billingInterval = 'monthly'"
          >
            Monthly
          </button>
          <button
            type="button"
            class="rounded-full px-4 py-1.5 transition-colors"
            :class="billingInterval === 'annual' ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground'"
            @click="billingInterval = 'annual'"
          >
            Annual
            <span class="ml-1 text-xs text-forest dark:text-peach">2 months free</span>
          </button>
        </div>
      </div>

      <!--
        A comparison table: plans across the top, features down the left, and
        a tick or cross in every cell — the same layout as the landing page.
        The Pro column inverts onto pine end to end; the feature column is
        sticky so its labels stay in view while the table scrolls sideways.
      -->
      <div class="relative">
        <div
          v-if="gatewayFinalizing"
          class="absolute inset-0 z-30 flex items-center justify-center p-4"
        >
          <div
            class="w-full max-w-4xl overflow-hidden rounded-3xl border border-cream/15 bg-pine text-cream shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gateway-notice-title"
          >
            <div class="grid divide-y divide-cream/15 md:grid-cols-2 md:divide-x md:divide-y-0">
              <div class="flex flex-col items-center justify-center gap-4 px-10 py-14 text-center">
                <div class="flex size-14 items-center justify-center rounded-full bg-cream/10">
                  <ClockIcon class="size-6 text-peach" />
                </div>
                <h2 id="gateway-notice-title" class="font-heading text-2xl font-medium tracking-tight text-cream">
                  Sorry — our checkout is still in its pajamas
                </h2>
                <p class="max-w-md text-base leading-relaxed text-cream/80">
                  We're putting the finishing touches on our payment gateway, so paid
                  plans are taking a short nap. Our apologies for the wait — we'll have
                  you subscribing in no time.
                </p>
              </div>

              <div class="flex flex-col items-center justify-center gap-4 px-10 py-14 text-center">
                <p class="text-base font-medium text-cream">
                  Already have a referral code?
                </p>
                <p class="max-w-md text-sm leading-relaxed text-cream/80">
                  Enter it below to claim your access.
                </p>

                <form class="mt-2 flex w-full max-w-sm gap-2" novalidate @submit.prevent="submitReferralCode">
                  <Input
                    v-model="referralCode"
                    placeholder="BETA-2026"
                    autocapitalize="characters"
                    autocomplete="off"
                    spellcheck="false"
                    class="h-11 font-mono tracking-wider uppercase"
                    :aria-invalid="referralError ? true : undefined"
                    :aria-describedby="referralError ? 'referral-code-error' : undefined"
                  />
                  <Button type="submit" class="h-11 shrink-0" :loading="redeemingReferral" :disabled="!canRedeemReferral">
                    <CheckIcon v-if="!redeemingReferral" class="size-4" />
                    Redeem
                  </Button>
                </form>

                <p
                  v-if="referralError"
                  id="referral-code-error"
                  role="alert"
                  class="mt-2 flex items-start justify-center gap-1.5 text-xs text-peach"
                >
                  <CircleAlertIcon class="mt-px size-3.5 shrink-0" />
                  <span>{{ referralError }}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        <div
          :class="gatewayFinalizing ? 'pointer-events-none select-none blur-[6px] saturate-50' : ''"
          aria-hidden="true"
        >
        <div class="surface overflow-x-auto">
        <table class="w-full min-w-[52rem] border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              <th scope="col" class="sticky left-0 z-20 border-b border-border bg-muted/50 p-5 align-bottom">
                <span class="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Plans &amp; features
                </span>
              </th>
              <th
                v-for="plan in plans"
                :key="plan.id"
                scope="col"
                :class="isPro(plan)
                  ? 'border-b border-cream/15 bg-pine p-5 align-bottom text-cream'
                  : 'border-b border-border p-5 align-bottom'"
              >
                <div class="flex min-h-[1.5rem] items-center justify-start">
                  <span
                    v-if="isPro(plan)"
                    class="rounded-full bg-forest px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-cream"
                  >
                    Most popular
                  </span>
                </div>
                <h3 class="mt-3 font-heading text-xl font-medium tracking-tight" :class="isPro(plan) ? 'text-cream' : 'text-foreground'">
                  {{ plan.name }}
                </h3>
                <p class="mt-1 text-[0.8125rem] leading-snug" :class="isPro(plan) ? 'text-cream/70' : 'text-muted-foreground'">
                  {{ plan.contact_sales
                    ? 'For organizations with their own terms'
                    : activeInterval === 'annual' ? 'per month, billed yearly' : 'per month' }}
                </p>

                <!--
                  A contact-sales plan has no list price to show. Quoting the
                  stored ₱0 would be quoting a number nobody agreed to, so the
                  column says what is actually true and points at a conversation.
                -->
                <div class="mt-5 flex items-end justify-start gap-1.5">
                  <span
                    class="font-heading text-[1.75rem] font-medium leading-none tracking-tight"
                    :class="isPro(plan) ? 'text-cream' : 'text-foreground'"
                  >
                    {{ plan.contact_sales ? 'Custom' : priceFor(plan) }}
                  </span>
                  <span v-if="!plan.contact_sales" class="pb-0.5 text-[0.8125rem] leading-tight" :class="isPro(plan) ? 'text-cream/60' : 'text-muted-foreground'">
                    /month
                  </span>
                </div>
                <p class="mt-2 text-[0.75rem] leading-snug" :class="isPro(plan) ? 'text-cream/60' : 'text-muted-foreground'">
                  <template v-if="plan.contact_sales">
                    Priced per organization · billed by invoice
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
                v-for="plan in plans"
                :key="plan.id"
                class="border-t px-5 py-5 text-center"
                :class="isPro(plan) ? 'border-cream/15 bg-pine' : 'border-border/60'"
              >
                <Button
                  v-if="plan.contact_sales && !isCurrent(plan)"
                  as="a"
                  variant="outline"
                  class="w-full max-w-[12rem]"
                  :href="contactSalesHref(plan)"
                >
                  Contact sales
                </Button>
                <Button
                  v-else
                  class="w-full max-w-[12rem]"
                  :variant="isPro(plan) ? 'default' : 'outline'"
                  :class="isPro(plan) ? 'bg-cream text-forest hover:bg-cream/90' : ''"
                  :disabled="isCurrent(plan)"
                  @click="handleChoose(plan)"
                >
                  {{ isCurrent(plan) ? 'Current plan' : hasActiveSubscription ? 'Switch to this plan' : 'Get started' }}
                </Button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
        </div>
      </div>

      <p
        v-if="!gatewayFinalizing"
        class="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center text-[0.8125rem] text-muted-foreground"
      >
        <span>No contract, cancel any time</span>
        <span aria-hidden="true" class="text-muted-foreground/40">·</span>
        <span>Secure checkout via PayMongo</span>
        <span aria-hidden="true" class="text-muted-foreground/40">·</span>
        <span>All prices in Philippine pesos</span>
      </p>

      <TrialCodeRedeem
        v-if="!gatewayFinalizing && auth.user && !hasActiveSubscription && !onTrial"
      />
    </template>

    <template v-else>
      <Button variant="ghost" size="sm" class="mb-6 -ml-2" @click="back">
        <ArrowLeftIcon class="size-4" />
        All plans
      </Button>

      <div class="mx-auto max-w-md">
        <div class="mb-8 text-center">
          <h1 class="text-2xl font-bold tracking-tight">Subscribe to {{ selectedPlan.name }}</h1>
          <p class="mt-2 text-muted-foreground">
            {{ priceFor(selectedPlan, selectedInterval) }} per month · billed {{ selectedInterval === 'annual' ? 'yearly' : 'monthly' }}
          </p>
          <p class="mt-1 text-sm font-medium">
            {{ billedLabel(selectedPlan, selectedInterval) }} charged today
            <span v-if="selectedInterval === 'annual'" class="font-normal text-muted-foreground">
              — covers 12 months, saving {{ annualSavingsLabel(selectedPlan) }}
            </span>
          </p>
        </div>

        <Card>
          <CardContent class="space-y-5 pt-6">
            <ul class="space-y-2 text-sm">
              <li v-for="feature in selectedPlan.features" :key="feature" class="flex items-start gap-2">
                <CheckIcon class="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{{ featureLabel(feature) }}</span>
              </li>
              <li v-for="limit in planLimits(selectedPlan)" :key="limit" class="flex items-start gap-2 text-muted-foreground">
                <CheckIcon class="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{{ limit }}</span>
              </li>
            </ul>

            <Button class="w-full" :disabled="processing" @click="handleCheckout">
              <Loader2Icon v-if="processing" class="size-4 animate-spin" />
              {{ processing ? 'Preparing checkout…' : `Pay ${billedLabel(selectedPlan, selectedInterval)}` }}
            </Button>
            <p class="text-center text-xs text-muted-foreground">
              You'll be taken to PayMongo's secure payment page to complete your subscription. Cards and Maya accepted.
            </p>
          </CardContent>
        </Card>
      </div>
    </template>
  </div>
</template>