<script setup lang="ts">
import type { Component } from 'vue'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BookOpenIcon,
  BriefcaseIcon,
  BuildingIcon,
  CheckIcon,
  CircleAlertIcon,
  FileSignatureIcon,
  FileTextIcon,
  GavelIcon,
  GraduationCapIcon,
  HandshakeIcon,
  HomeIcon,
  KeyIcon,
  LandmarkIcon,
  LayersIcon,
  MailIcon,
  MapIcon,
  MoonIcon,
  PencilIcon,
  ScaleIcon,
  ScrollTextIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SproutIcon,
  StampIcon,
  StoreIcon,
  SunIcon,
  TractorIcon,
  UserRoundIcon,
} from '@lucide/vue'
import type { OnboardingChoice } from '~/components/OnboardingOptions.vue'
import {
  KYC_MAX_ROLES,
  KYC_MAX_USE_CASES,
  KYC_ROLE_OTHER,
  KYC_USE_CASE_OTHER,
  kycDocumentTypeOptions,
  kycExperienceLevelOptions,
  kycRoleOptions,
  kycUseCaseOptions,
} from '~/utils/kyc'

definePageMeta({
  middleware: 'auth',
  layout: 'bare',
})

const auth = useAuthStore()

// `next` is honoured here too: the onboarding guard sends users back with the
// page they asked for attached, and a second visit should not lose it.
const nextUrl = useRoute().query.next

const billing = useBillingStore()

/**
 * Where answering the questions leads.
 *
 * With the organization step gone, these questions are the last thing between
 * signing up and being asked to pay — so an account with no plan is sent to
 * the pricing page directly. The subscription guard would bounce them there
 * anyway; going straight avoids a flash of a workspace they cannot open yet.
 */
function destination() {
  if (typeof nextUrl === 'string' && nextUrl.length > 0) return nextUrl
  if (auth.user?.is_admin || billing.accessGranted) return auth.homePath()

  return '/pricing'
}

if (!billing.subscription) {
  await billing.fetchSubscription()
}

if (auth.kycCompleted) {
  await navigateTo(destination())
}

const { isDark, toggle: toggleTheme } = useTheme()

/**
 * Experience and document types were one crowded screen. Splitting them gives
 * each question the page to itself, which keeps every step to a single decision.
 */
const steps = [
  {
    label: 'Your role',
    heading: 'What best describes you?',
    hint: 'Select all that apply. Your roles set how formal and how technical Batayan is with you.',
  },
  {
    label: 'Your work',
    heading: 'What will you mainly use Batayan for?',
    hint: 'Select all that apply. These decide whether answers lean toward drafting, research, or plain explanation.',
  },
  {
    label: 'Your documents',
    heading: 'Which documents do you work with?',
    hint: 'Select all that apply. Batayan uses these to anticipate the clauses and requirements each one needs.',
  },
  {
    label: 'Your experience',
    heading: 'How familiar are you with legal documents?',
    hint: 'This calibrates how much step-by-step guidance comes with each answer.',
  },
] as const

const TOTAL = steps.length

/** Icons are presentation, so they live here rather than in the shared KYC options. */
const roleIcons: Record<string, Component> = {
  private_individual: UserRoundIcon,
  lawyer: ScaleIcon,
  paralegal: FileTextIcon,
  government_employee: LandmarkIcon,
  real_estate_broker: HomeIcon,
  farmer: TractorIcon,
  business_owner: StoreIcon,
  law_student: GraduationCapIcon,
  notary_public: StampIcon,
  [KYC_ROLE_OTHER]: SparklesIcon,
}

const useCaseIcons: Record<string, Component> = {
  personal_dispute: GavelIcon,
  own_transaction: PencilIcon,
  client_work: BriefcaseIcon,
  legal_research: SearchIcon,
  government_transaction: BuildingIcon,
  agrarian_land: MapIcon,
  learning: BookOpenIcon,
  [KYC_USE_CASE_OTHER]: SparklesIcon,
}

const documentIcons: Record<string, Component> = {
  demand_letter: MailIcon,
  contract: HandshakeIcon,
  deed: FileSignatureIcon,
  affidavit: ShieldCheckIcon,
  government_letter: LandmarkIcon,
  complaint: GavelIcon,
  power_of_attorney: ScrollTextIcon,
  lease: KeyIcon,
  other_doc: LayersIcon,
}

function withIcons(options: KycOption[], icons: Record<string, Component>): OnboardingChoice[] {
  return options.map(option => ({ ...option, icon: icons[option.value] ?? LayersIcon }))
}

const roleChoices = withIcons(kycRoleOptions, roleIcons)
const useCaseChoices = withIcons(kycUseCaseOptions, useCaseIcons)
const documentChoices = withIcons(kycDocumentTypeOptions, documentIcons)

const experienceIcons: Record<string, Component> = {
  beginner: SproutIcon,
  intermediate: BookOpenIcon,
  experienced: BriefcaseIcon,
  professional: ScaleIcon,
}

/** The em dash in each experience label separates the level from its meaning. */
const experienceChoices: OnboardingChoice[] = kycExperienceLevelOptions.map((option) => {
  const [level, meaning] = option.label.split('—')

  return {
    value: option.value,
    label: (level ?? option.label).trim(),
    hint: meaning?.trim(),
    icon: experienceIcons[option.value] ?? LayersIcon,
  }
})

const step = ref(1)
/** Drives which way the step transition slides, so Back reads as going back. */
const direction = ref<'forward' | 'back'>('forward')
const roles = ref<string[]>([])
const roleOther = ref('')
const useCases = ref<string[]>([])
const useCaseOther = ref('')
const documentTypes = ref<string[]>([])
const experienceLevel = ref<string | null>(null)
const error = ref('')
const submitting = ref(false)

const current = computed(() => steps[step.value - 1]!)
const isLast = computed(() => step.value === TOTAL)
const progress = computed(() => Math.round(((step.value - 1) / TOTAL) * 100))

const rolesHasOther = computed(() => roles.value.includes(KYC_ROLE_OTHER))
const useCasesHasOther = computed(() => useCases.value.includes(KYC_USE_CASE_OTHER))

const canContinue = computed(() => {
  if (step.value === 1) {
    return roles.value.length > 0 && (!rolesHasOther.value || roleOther.value.trim() !== '')
  }
  if (step.value === 2) {
    return useCases.value.length > 0 && (!useCasesHasOther.value || useCaseOther.value.trim() !== '')
  }
  if (step.value === 3) return documentTypes.value.length > 0

  return experienceLevel.value !== null
})

// Dropping "Other" makes the free-text answer dead weight; keeping it would
// send a stale description alongside the remaining choices.
watch(rolesHasOther, (hasOther) => {
  if (!hasOther) roleOther.value = ''
})

watch(useCasesHasOther, (hasOther) => {
  if (!hasOther) useCaseOther.value = ''
})

function back() {
  if (step.value === 1) return

  direction.value = 'back'
  step.value--
}

/** Submits on the last step, so Enter finishes the flow like it advances the others. */
function advance() {
  if (!canContinue.value) return

  if (isLast.value) {
    handleSubmit()
    return
  }

  direction.value = 'forward'
  step.value++
}

async function handleSubmit() {
  if (submitting.value || !canContinue.value) return

  error.value = ''
  submitting.value = true

  try {
    await auth.saveKyc({
      kyc_role: roles.value,
      ...(rolesHasOther.value ? { kyc_role_other: roleOther.value.trim() } : {}),
      kyc_use_case: useCases.value,
      ...(useCasesHasOther.value ? { kyc_use_case_other: useCaseOther.value.trim() } : {}),
      kyc_document_types: documentTypes.value,
      kyc_experience_level: experienceLevel.value!,
    })

    await navigateTo(`/preparing?next=${encodeURIComponent(destination())}`)
  } catch (err: any) {
    error.value = err?.data?.message ?? 'Could not save your profile. Please try again.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden lg:flex-row">
    <!--
      This element is pinned to the viewport rather than growing with its
      content: the step that lists nine document types used to push the page
      taller than the screen, which scrolled the brand rail and the Continue
      button out of sight. Height is fixed here and the question column scrolls
      inside itself instead, so the rail, the stepper, and the actions are
      always on screen. The note lives inside the root rather than above it — a
      comment beside the root element counts as a second root node, which costs
      the page its transitions (NUXT_E4004).
    -->
    <!--
      Brand rail, carrying the same forest panel as the sign-in screens so
      onboarding reads as the next room rather than a different building. It
      also holds the stepper, which frees the form column for one question.
    -->
    <aside class="relative hidden overflow-hidden bg-forest px-12 py-14 text-cream lg:flex lg:w-[38%] lg:max-w-md lg:shrink-0 lg:flex-col xl:px-14">
      <div aria-hidden="true" class="pointer-events-none absolute -right-28 -top-28 size-80 rounded-full bg-peach/10 blur-3xl" />
      <div aria-hidden="true" class="pointer-events-none absolute -bottom-32 -left-24 size-96 rounded-full bg-peach/[0.07] blur-3xl" />

      <div class="relative flex w-fit items-center gap-2.5 font-heading text-lg font-semibold tracking-tight">
        <span class="size-2.5 rounded-full bg-peach" />
        Batayan
      </div>

      <!-- Scrolls on its own only if a short viewport can't fit the stepper;
           the decorative blurs stay clipped by the aside above. -->
      <div class="relative my-auto min-h-0 overflow-y-auto py-10">
        <h2 class="font-heading text-3xl leading-[1.2] tracking-tight xl:text-4xl">
          A few questions, then you're in.
        </h2>
        <p class="mt-3 text-sm leading-relaxed text-cream/70">
          Four quick answers let Batayan match its tone, depth, and drafting style to
          the work you actually do.
        </p>

        <ol class="mt-10 space-y-1">
          <li
            v-for="(item, index) in steps"
            :key="item.label"
            class="flex items-center gap-3.5 rounded-lg px-2 py-2.5 transition-colors duration-300"
            :class="index + 1 === step ? 'bg-cream/[0.07]' : undefined"
            :aria-current="index + 1 === step ? 'step' : undefined"
          >
            <span
              class="flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-all duration-300"
              :class="index + 1 < step
                ? 'border-peach bg-peach text-espresso'
                : index + 1 === step
                  ? 'border-peach text-peach'
                  : 'border-cream/25 text-cream/40'"
            >
              <CheckIcon v-if="index + 1 < step" class="size-3.5" :stroke-width="3" />
              <template v-else>{{ index + 1 }}</template>
            </span>
            <span
              class="text-sm transition-colors duration-300"
              :class="index + 1 === step ? 'font-medium text-cream' : index + 1 < step ? 'text-cream/70' : 'text-cream/40'"
            >
              {{ item.label }}
            </span>
          </li>
        </ol>
      </div>

      <p class="relative border-t border-cream/15 pt-6 text-xs leading-relaxed text-cream/60">
        Your answers stay private to your account and only shape how Batayan responds.
        You can change them anytime in Settings.
      </p>
    </aside>

    <main class="flex min-h-0 flex-1 flex-col px-5 sm:px-8">
      <div class="flex shrink-0 items-center justify-between gap-4 py-6 lg:justify-end">
        <div class="flex items-center gap-2 font-heading font-semibold tracking-tight lg:hidden">
          <span class="size-2.5 rounded-full bg-primary" />
          Batayan
        </div>
        <button
          type="button"
          aria-label="Toggle theme"
          class="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          @click="toggleTheme"
        >
          <component :is="isDark ? SunIcon : MoonIcon" class="size-4" />
        </button>
      </div>

      <div class="flex min-h-0 flex-1 justify-center pb-6">
        <div class="flex min-h-0 w-full max-w-[32rem] flex-col">
          <!-- Mobile progress. The rail's stepper is off-screen here, so the
               step count and bar carry the sense of place instead. -->
          <div class="shrink-0 lg:hidden">
            <div class="flex items-center justify-between text-xs font-medium">
              <span class="text-muted-foreground">Step {{ step }} of {{ TOTAL }}</span>
              <span>{{ current.label }}</span>
            </div>
            <div class="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                class="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                :style="{ width: `${Math.max(progress, 6)}%` }"
              />
            </div>
          </div>

          <form novalidate class="mt-6 flex min-h-0 flex-1 flex-col lg:mt-0" @submit.prevent="advance">
            <!--
              The question itself stays pinned — it is the context for every
              option below it, so it must not scroll away mid-answer. It gets
              its own transition keyed to the same step, so it still slides in
              step with the options.
            -->
            <!--
              Outgoing and incoming headings share one grid cell so the block
              is never empty mid-swap. With out-in the pinned heading would
              vanish for a frame and the scroll region below would snap taller
              and back — the stack keeps its height at max(old, new) instead.
            -->
            <div class="grid shrink-0 pb-5 *:col-start-1 *:row-start-1">
              <Transition :name="direction === 'forward' ? 'step-next' : 'step-prev'">
                <div :key="step">
                  <h1 class="text-[1.6rem] font-semibold leading-tight tracking-tight">
                    {{ current.heading }}
                  </h1>
                  <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {{ current.hint }}
                  </p>
                </div>
              </Transition>
            </div>

            <!--
              The only scrolling region on the page. overflow-x is clamped
              because the step transition slides its content horizontally and
              would otherwise flash a sideways scrollbar mid-animation.
            -->
            <div class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 pb-2">
            <Transition :name="direction === 'forward' ? 'step-next' : 'step-prev'" mode="out-in">
              <div :key="step">
                <div>
                  <template v-if="step === 1">
                    <OnboardingOptions
                      v-model="roles"
                      name="kyc-role"
                      :options="roleChoices"
                      multiple
                      :max="KYC_MAX_ROLES"
                    />
                    <p class="mt-3 text-xs text-muted-foreground">
                      {{ roles.length }} of {{ KYC_MAX_ROLES }} selected
                    </p>

                    <div v-if="rolesHasOther" class="mt-3">
                      <Label for="kyc_role_other" class="text-xs font-medium text-muted-foreground">
                        Tell us about your role
                      </Label>
                      <Input
                        id="kyc_role_other"
                        v-model="roleOther"
                        maxlength="255"
                        autofocus
                        placeholder="e.g. Community organizer at a farmers cooperative"
                        class="mt-1.5 h-10"
                      />
                    </div>
                  </template>

                  <template v-else-if="step === 2">
                    <OnboardingOptions
                      v-model="useCases"
                      name="kyc-use-case"
                      :options="useCaseChoices"
                      multiple
                      :max="KYC_MAX_USE_CASES"
                    />
                    <p class="mt-3 text-xs text-muted-foreground">
                      {{ useCases.length }} of {{ KYC_MAX_USE_CASES }} selected
                    </p>

                    <div v-if="useCasesHasOther" class="mt-3">
                      <Label for="kyc_use_case_other" class="text-xs font-medium text-muted-foreground">
                        Tell us about your primary use
                      </Label>
                      <Input
                        id="kyc_use_case_other"
                        v-model="useCaseOther"
                        maxlength="255"
                        autofocus
                        placeholder="e.g. Helping my barangay with titling paperwork"
                        class="mt-1.5 h-10"
                      />
                    </div>
                  </template>

                  <template v-else-if="step === 3">
                    <OnboardingOptions
                      v-model="documentTypes"
                      name="kyc-document-types"
                      :options="documentChoices"
                      multiple
                      dense
                    />
                    <p class="mt-3 text-xs text-muted-foreground">
                      {{ documentTypes.length }} selected
                    </p>
                  </template>

                  <template v-else>
                    <OnboardingOptions
                      v-model="experienceLevel"
                      name="kyc-experience"
                      :options="experienceChoices"
                    />
                  </template>
                </div>
              </div>
            </Transition>
            </div>

            <div
              v-if="error"
              role="alert"
              class="mt-4 flex shrink-0 items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
            >
              <CircleAlertIcon class="mt-px size-4 shrink-0" />
              <span>{{ error }}</span>
            </div>

            <!-- Pinned below the scroll region: Back and Continue must never be
                 something the user has to scroll to reach. -->
            <div class="mt-4 flex shrink-0 items-center justify-between gap-3 border-t border-border/70 pt-4">
              <Button
                v-if="step > 1"
                type="button"
                variant="ghost"
                class="-ml-2 h-10 gap-1.5"
                :disabled="submitting"
                @click="back"
              >
                <ArrowLeftIcon class="size-4" />
                Back
              </Button>
              <span v-else />

              <Button type="submit" class="h-10 min-w-36 gap-1.5" :disabled="!canContinue" :loading="submitting">
                <template v-if="isLast">
                  {{ submitting ? 'Setting up…' : 'Finish setup' }}
                </template>
                <template v-else>
                  Continue
                  <ArrowRightIcon class="size-4" />
                </template>
              </Button>
            </div>
          </form>

          <p class="mt-4 shrink-0 pt-3 text-center text-xs leading-relaxed text-muted-foreground lg:hidden">
            Your answers stay private to your account. You can change them anytime in Settings.
          </p>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* Direction-aware step change: the content leaves the way you're heading and
   the next screen arrives from the opposite edge, so Back reads as reversal. */
.step-next-enter-active,
.step-next-leave-active,
.step-prev-enter-active,
.step-prev-leave-active {
  transition: opacity 0.22s ease, transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}

.step-next-enter-from {
  opacity: 0;
  transform: translateX(1.25rem);
}

.step-next-leave-to {
  opacity: 0;
  transform: translateX(-1rem);
}

.step-prev-enter-from {
  opacity: 0;
  transform: translateX(-1.25rem);
}

.step-prev-leave-to {
  opacity: 0;
  transform: translateX(1rem);
}

@media (prefers-reduced-motion: reduce) {
  .step-next-enter-active,
  .step-next-leave-active,
  .step-prev-enter-active,
  .step-prev-leave-active {
    transition-duration: 0.01ms;
  }

  .step-next-enter-from,
  .step-next-leave-to,
  .step-prev-enter-from,
  .step-prev-leave-to {
    transform: none;
  }
}
</style>
