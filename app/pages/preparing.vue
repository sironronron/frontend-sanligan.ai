<script setup lang="ts">
import { CheckIcon } from '@lucide/vue'
import { kycDocumentTypeLabel, kycExperienceLevelLabel, kycKeys, kycRoleLabel } from '~/utils/kyc'

definePageMeta({
  layout: 'bare',
  middleware: ['auth'],
})

const auth = useAuthStore()
const route = useRoute()

/**
 * The stored labels carry qualifiers nobody needs read back to them —
 * "Deed (Sale, Donation, Assignment)" is just "Deed" on this screen.
 */
function shorten(label: string) {
  return (label.split(/[(/—]/)[0] ?? label).trim()
}

const documentTypes = computed(() => kycKeys(auth.user?.kyc_document_types))

/** The first role the user picked; the line reads as one job, so it names one. */
const primaryRole = computed(() => kycKeys(auth.user?.kyc_role)[0] ?? null)

/** At most two, so the status line stays one line on a phone. */
const documentSummary = computed(() => {
  const labels = documentTypes.value
    .slice(0, 2)
    .map(value => shorten(kycDocumentTypeLabel(value)).toLowerCase())

  return labels.join(' and ')
})

/**
 * Each line names something the account genuinely gets set up with, and where
 * the onboarding answers give a more specific truth it says that instead —
 * seeing your own answer come back is what makes the wait feel like work.
 */
const steps = computed(() => [
  'Preparing your legal workspace',
  'Loading Philippine legal sources',
  documentSummary.value
    ? `Setting up ${documentSummary.value} templates`
    : 'Setting up your document library',
  primaryRole.value
    ? `Calibrating for ${shorten(kycRoleLabel(primaryRole.value)).toLowerCase()} work`
    : 'Configuring your practice areas',
  auth.user?.kyc_experience_level
    ? `Tuning detail to ${shorten(kycExperienceLevelLabel(auth.user.kyc_experience_level)).toLowerCase()} level`
    : 'Personalizing your experience',
])

/**
 * The page's whole subject: a document drafting itself. Each row belongs to the
 * step that "writes" it, so the sheet fills in lockstep with the status line
 * rather than running its own decorative loop.
 */
const rows = [
  { step: 0, kind: 'title', width: 64 },
  { step: 0, kind: 'sub', width: 40 },
  { step: 1, kind: 'text', width: 100 },
  { step: 1, kind: 'text', width: 93 },
  { step: 1, kind: 'text', width: 74 },
  { step: 2, kind: 'text', width: 97 },
  { step: 2, kind: 'text', width: 100 },
  { step: 2, kind: 'text', width: 82 },
  { step: 3, kind: 'bullet', width: 76 },
  { step: 3, kind: 'bullet', width: 66 },
  { step: 3, kind: 'text', width: 88 },
] as const

const STEP_MS = 1000
/** A beat on the finished state, so the seal is seen landing rather than skipped. */
const SETTLE_MS = 900

const activeStep = ref(0)
const finished = ref(false)

/** First name only — "Setting things up, Maria" reads as addressed to a person. */
const firstName = computed(() => String(auth.user?.name ?? '').trim().split(/\s+/)[0] ?? '')

const status = computed(() => (finished.value ? 'Your workspace is ready.' : steps.value[activeStep.value]))

/**
 * The active row gets partial credit, so the bar creeps through each step
 * instead of sitting still and then jumping — a still bar reads as stalled.
 */
const progress = computed(() => {
  const count = steps.value.length
  const done = finished.value ? count : activeStep.value + 0.55

  return Math.round((done / count) * 100)
})

/** A row is written once its step is current; the signature block waits for the end. */
function written(step: number) {
  return finished.value || step <= activeStep.value
}

/** Rows appear one after another within their step rather than as a block. */
function rowDelay(index: number) {
  const step = rows[index]!.step
  const positionInStep = rows.slice(0, index).filter(row => row.step === step).length

  return `${positionInStep * 130}ms`
}

const timers: ReturnType<typeof setTimeout>[] = []

onMounted(() => {
  const destination = (route.query.next as string) || auth.homePath()
  const count = steps.value.length

  for (let index = 1; index < count; index++) {
    timers.push(setTimeout(() => { activeStep.value = index }, STEP_MS * index))
  }

  timers.push(setTimeout(() => { finished.value = true }, STEP_MS * count))
  timers.push(setTimeout(() => navigateTo(destination), STEP_MS * count + SETTLE_MS))
})

// Without this, a user who navigates away mid-sequence is still yanked to the
// destination when the last timer fires against the unmounted component.
onUnmounted(() => timers.forEach(clearTimeout))
</script>

<template>
  <div class="preparing">
    <div aria-hidden="true" class="wash" />

    <div class="relative flex w-full max-w-md flex-col items-center px-6">
      <!--
        The document is the screen. It's decorative to a screen reader — the
        status line below carries the same information as text.
      -->
      <div class="sheet-wrap" aria-hidden="true">
        <div class="sheet-shadow-page" />

        <div class="sheet" :class="{ 'sheet-sealed': finished }">
          <!-- Letterhead: present from the first frame, so the page reads as
               a document even before any line is written. -->
          <div class="letterhead">
            <span class="mark" />
            <span class="mark-bar" />
            <span class="date-bar" />
          </div>

          <div class="body">
            <div
              v-for="(row, index) in rows"
              :key="index"
              class="row"
              :class="[`row-${row.kind}`, { 'row-written': written(row.step) }]"
              :style="{ '--w': `${row.width}%`, transitionDelay: written(row.step) ? rowDelay(index) : '0ms' }"
            >
              <span v-if="row.kind === 'bullet'" class="dot" />
              <span class="bar" />
            </div>
          </div>

          <!-- Signing block. It lands with the seal, because a document isn't
               finished until it's signed. -->
          <div class="signing" :class="{ 'signing-done': finished }">
            <span class="sig-line" />
            <span class="seal">
              <CheckIcon class="size-5" :stroke-width="3" />
            </span>
          </div>

          <!-- Drafting sweep: a pass of light down the page while work is in
               flight, replacing the spinner this screen used to need. -->
          <div v-if="!finished" class="scan" />
        </div>
      </div>

      <p class="mt-9 text-center text-sm text-muted-foreground">
        <template v-if="firstName">
          Setting things up, <span class="font-medium text-foreground">{{ firstName }}</span>.
        </template>
        <template v-else>
          Setting up your workspace.
        </template>
      </p>

      <div class="status" role="status" aria-live="polite">
        <Transition name="status" mode="out-in">
          <p :key="status" class="status-line" :class="{ 'status-ready': finished }">
            {{ status }}
          </p>
        </Transition>
      </div>

      <div
        class="mt-5 h-1 w-full max-w-xs overflow-hidden rounded-full bg-muted-foreground/20"
        role="progressbar"
        :aria-valuenow="progress"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-label="Preparing your workspace"
      >
        <div class="progress-fill" :style="{ width: `${progress}%` }" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.preparing {
  position: relative;
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 3rem 0;
}

/* A single soft wash rather than drifting orbs: the page is the moving part
   now, and two competing animations would split attention. */
.wash {
  position: absolute;
  top: 50%;
  left: 50%;
  width: min(44rem, 120vw);
  height: min(44rem, 120vw);
  transform: translate(-50%, -50%);
  border-radius: 9999px;
  background: radial-gradient(
    circle,
    color-mix(in oklab, var(--color-primary) 12%, transparent) 0%,
    transparent 68%
  );
  pointer-events: none;
}

/* Sheet ------------------------------------------------------------------- */

.sheet-wrap {
  position: relative;
  width: min(20rem, 78vw);
  animation: rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
}

/* A second page peeking out behind, so the sheet reads as paper on a desk
   rather than a floating rectangle. */
.sheet-shadow-page {
  position: absolute;
  inset: 0;
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  background: color-mix(in oklab, var(--color-card) 70%, var(--color-background));
  transform: rotate(-3deg) translateY(0.35rem);
  opacity: 0.7;
}

.sheet {
  position: relative;
  display: flex;
  flex-direction: column;
  /* Portrait, close to a page. Aspect ratio rather than a fixed height, so it
     scales down on a phone without reflowing its contents. */
  aspect-ratio: 1 / 1.16;
  padding: 1.5rem 1.5rem 1.25rem;
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  background: var(--color-card);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.05), 0 24px 48px -28px rgb(0 0 0 / 0.45);
  overflow: hidden;
  transition: box-shadow 0.6s ease, border-color 0.6s ease;
}

.sheet-sealed {
  border-color: color-mix(in oklab, var(--color-primary) 45%, var(--color-border));
  box-shadow:
    0 1px 2px rgb(0 0 0 / 0.05),
    0 24px 48px -28px rgb(0 0 0 / 0.45),
    0 0 0 3px color-mix(in oklab, var(--color-primary) 12%, transparent);
}

/* Letterhead */

.letterhead {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-bottom: 0.875rem;
  border-bottom: 1px solid color-mix(in oklab, var(--color-border) 70%, transparent);
}

.mark {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background: var(--color-primary);
}

.mark-bar {
  width: 3.25rem;
  height: 0.4375rem;
  border-radius: 9999px;
  background: color-mix(in oklab, var(--color-foreground) 45%, transparent);
}

.date-bar {
  width: 2rem;
  height: 0.375rem;
  border-radius: 9999px;
  margin-left: auto;
  background: color-mix(in oklab, var(--color-muted-foreground) 35%, transparent);
}

/* Written rows */

.body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-top: 1rem;
}

.row {
  display: flex;
  align-items: center;
  gap: 0.4375rem;
  opacity: 0;
  transition: opacity 0.45s ease;
}

.row-written {
  opacity: 1;
}

/*
 * The bar grows from zero to its own width, so each line reads as being typed
 * out left to right rather than fading in whole.
 */
.bar {
  display: block;
  width: 0;
  height: 0.4375rem;
  border-radius: 9999px;
  background: color-mix(in oklab, var(--color-muted-foreground) 30%, transparent);
  transition: width 0.55s cubic-bezier(0.16, 1, 0.3, 1);
  transition-delay: inherit;
}

.row-written .bar {
  width: var(--w);
}

.row-title .bar {
  height: 0.75rem;
  background: color-mix(in oklab, var(--color-foreground) 60%, transparent);
}

.row-sub {
  margin-bottom: 0.375rem;
}

.row-sub .bar {
  height: 0.5rem;
  background: color-mix(in oklab, var(--color-primary) 55%, transparent);
}

.row-bullet {
  padding-left: 0.5rem;
}

.dot {
  width: 0.25rem;
  height: 0.25rem;
  flex-shrink: 0;
  border-radius: 9999px;
  background: color-mix(in oklab, var(--color-muted-foreground) 45%, transparent);
}

/* Signing block */

.signing {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-top: auto;
}

.sig-line {
  width: 45%;
  height: 1px;
  background: color-mix(in oklab, var(--color-muted-foreground) 45%, transparent);
  opacity: 0;
  transition: opacity 0.5s ease 0.15s;
}

.signing-done .sig-line {
  opacity: 1;
}

.seal {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 9999px;
  border: 2px solid var(--color-primary);
  color: var(--color-primary);
  background: color-mix(in oklab, var(--color-primary) 10%, transparent);
  /* Stamped, not faded in: overshoot then settle, slightly off-square like a
     seal pressed by hand. */
  opacity: 0;
  transform: scale(1.6) rotate(-18deg);
  transition: opacity 0.28s ease, transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.signing-done .seal {
  opacity: 1;
  transform: scale(1) rotate(-7deg);
}

/* Drafting sweep */

.scan {
  position: absolute;
  left: 0;
  right: 0;
  height: 40%;
  top: -40%;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    transparent,
    color-mix(in oklab, var(--color-primary) 9%, transparent),
    transparent
  );
  animation: sweep 2.4s ease-in-out infinite;
}

@keyframes sweep {
  0% { transform: translateY(0); }
  100% { transform: translateY(350%); }
}

@keyframes rise {
  from { opacity: 0; transform: translateY(0.75rem); }
  to { opacity: 1; transform: translateY(0); }
}

/* Status ------------------------------------------------------------------ */

/* Fixed height, so swapping lines of different lengths never nudges the bar
   or the sheet above it. */
.status {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 1.75rem;
  margin-top: 0.5rem;
}

.status-line {
  font-size: 0.9375rem;
  font-weight: 500;
  text-align: center;
  color: var(--color-foreground);
}

.status-ready {
  color: var(--color-primary);
}

.status-enter-active,
.status-leave-active {
  transition: opacity 0.25s ease, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.status-enter-from {
  opacity: 0;
  transform: translateY(0.4rem);
}

.status-leave-to {
  opacity: 0;
  transform: translateY(-0.4rem);
}

.progress-fill {
  height: 100%;
  border-radius: 9999px;
  /* Solid, not a gradient into peach: on the cream background the peach end
     was indistinguishable from the empty track, so the bar read as stuck. */
  background: var(--color-primary);
  /* Driven off the step state rather than a fixed keyframe, so the bar and the
     document can never drift out of sync. */
  transition: width 0.7s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Motion preferences ------------------------------------------------------ */

@media (prefers-reduced-motion: reduce) {
  .sheet-wrap,
  .scan {
    animation: none;
  }

  .scan {
    display: none;
  }

  .seal {
    transform: rotate(-7deg);
  }

  .row,
  .bar,
  .sig-line,
  .seal,
  .sheet,
  .progress-fill,
  .status-enter-active,
  .status-leave-active {
    transition-duration: 0.01ms;
  }

  .status-enter-from,
  .status-leave-to {
    transform: none;
  }
}
</style>
