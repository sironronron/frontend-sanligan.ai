<script setup lang="ts">
import { ArrowLeftIcon, CheckIcon, Loader2Icon } from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import { useBillingStore, type BillingInterval, type Plan } from '~/stores/billing'

definePageMeta({
  layout: 'minimal',
})

const billing = useBillingStore()
const auth = useAuthStore()
const router = useRouter()

const plans = ref<Plan[]>([])
const loading = ref(true)

const billingInterval = ref<BillingInterval>('monthly')
const selectedPlan = ref<Plan | null>(null)
const selectedInterval = ref<BillingInterval>('monthly')
const processing = ref(false)

const currentPlanId = computed(() => billing.subscription?.plan?.id ?? null)
const hasActiveSubscription = computed(() => {
  const sub = billing.subscription
  return !!sub && sub.status === 'active'
})

const activeInterval = computed<BillingInterval>(() =>
  hasActiveSubscription.value
    ? (billing.subscription?.interval ?? 'monthly')
    : billingInterval.value,
)

const planLimits = (plan: Plan) => [
  plan.limits.active_cases === null ? 'Unlimited active cases' : `${plan.limits.active_cases} active cases`,
  plan.limits.documents_uploaded === null
    ? 'Unlimited document uploads'
    : `${plan.limits.documents_uploaded} document uploads/mo`,
  plan.limits.messages_used === null
    ? 'Unlimited AI messages'
    : `${plan.limits.messages_used} AI messages/mo`,
  plan.overage_price === null
    ? 'No overage — hard message cap'
    : `Overage ${plan.overage_label}/msg`,
]

function priceFor(plan: Plan) {
  return activeInterval.value === 'annual' ? plan.price_annual_label : plan.price_label
}

function isCurrent(plan: Plan) {
  return currentPlanId.value === plan.id
}

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
  if (isCurrent(plan)) return
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
  plans.value = billing.plans
  loading.value = false
})
</script>

<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
    <template v-if="!selectedPlan">
      <div v-if="auth.user && hasActiveSubscription" class="mb-6 flex justify-center">
        <NuxtLink
          to="/chat"
          class="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeftIcon class="size-4" />
          Back to app
        </NuxtLink>
      </div>
      <div class="mb-10 text-center">
        <h1 class="text-3xl font-bold tracking-tight sm:text-4xl">Simple pricing for your practice</h1>
        <p class="mx-auto mt-3 max-w-xl text-muted-foreground">
          Pay per account. Cancel or switch plans any time. Cards and Maya accepted.
        </p>
        <div v-if="!hasActiveSubscription" class="mt-6 inline-flex items-center rounded-full border bg-muted/40 p-1 text-sm">
          <button
            type="button"
            class="rounded-full px-4 py-1.5 transition-colors"
            :class="billingInterval === 'monthly' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'"
            @click="billingInterval = 'monthly'"
          >
            Monthly
          </button>
          <button
            type="button"
            class="rounded-full px-4 py-1.5 transition-colors"
            :class="billingInterval === 'annual' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'"
            @click="billingInterval = 'annual'"
          >
            Annual
            <span class="ml-1 text-xs text-forest dark:text-peach">2 months free</span>
          </button>
        </div>
      </div>

      <div v-if="loading" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="i in 3" :key="i" class="h-80 rounded-xl border bg-muted/20" />
      </div>

      <div v-else class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          v-for="plan in plans"
          :key="plan.id"
          class="relative flex flex-col"
          :class="plan.slug === 'pro' ? 'border-primary shadow-lg' : ''"
        >
          <Badge
            v-if="plan.slug === 'pro'"
            class="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground"
          >
            Most popular
          </Badge>
          <CardHeader>
            <CardTitle>{{ plan.name }}</CardTitle>
            <CardDescription>{{ plan.interval === 'yearly' ? 'per month, billed yearly' : 'per month' }}</CardDescription>
          </CardHeader>
          <CardContent class="flex flex-1 flex-col gap-6">
            <div>
              <span class="text-4xl font-bold tracking-tight">{{ priceFor(plan) }}</span>
              <span class="text-sm text-muted-foreground"> /month</span>
              <p v-if="activeInterval === 'annual'" class="mt-1 text-xs text-muted-foreground">
                billed annually · save 2 months
              </p>
            </div>

            <ul class="space-y-2 text-sm">
              <li v-for="feature in plan.features" :key="feature" class="flex items-start gap-2">
                <CheckIcon class="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{{ feature }}</span>
              </li>
              <li v-for="limit in planLimits(plan)" :key="limit" class="flex items-start gap-2 text-muted-foreground">
                <CheckIcon class="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{{ limit }}</span>
              </li>
            </ul>

            <div class="mt-auto pt-2">
              <Button
                class="w-full"
                :variant="plan.slug === 'pro' ? 'default' : 'outline'"
                :disabled="isCurrent(plan)"
                @click="handleChoose(plan)"
              >
                {{ isCurrent(plan) ? 'Current plan' : hasActiveSubscription ? 'Switch to this plan' : 'Get started' }}
              </Button>
              <p v-if="hasActiveSubscription && !isCurrent(plan)" class="mt-2 text-center text-xs text-muted-foreground">
                Switch takes effect immediately
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
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
            {{ priceFor(selectedPlan) }} per month · billed {{ selectedInterval === 'annual' ? 'yearly' : 'monthly' }}
          </p>
        </div>

        <Card>
          <CardContent class="space-y-5 pt-6">
            <ul class="space-y-2 text-sm">
              <li v-for="feature in selectedPlan.features" :key="feature" class="flex items-start gap-2">
                <CheckIcon class="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{{ feature }}</span>
              </li>
              <li v-for="limit in planLimits(selectedPlan)" :key="limit" class="flex items-start gap-2 text-muted-foreground">
                <CheckIcon class="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{{ limit }}</span>
              </li>
            </ul>

            <Button class="w-full" :disabled="processing" @click="handleCheckout">
              <Loader2Icon v-if="processing" class="size-4 animate-spin" />
              {{ processing ? 'Preparing checkout…' : `Pay ${priceFor(selectedPlan)}` }}
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
