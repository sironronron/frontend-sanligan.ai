<script setup lang="ts">
import { CheckIcon } from '@lucide/vue'

definePageMeta({
  layout: 'bare',
  middleware: ['auth'],
})

const auth = useAuthStore()
const route = useRoute()

/** Each line names something the account genuinely gets set up with. */
const steps = [
  'Preparing your legal workspace',
  'Setting up your document library',
  'Configuring your practice areas',
  'Initializing your case files',
  'Personalizing your experience',
] as const

const STEP_MS = 1500
/** A beat on the finished state, so the last tick is seen rather than skipped. */
const SETTLE_MS = 900

const activeStep = ref(0)
const finished = ref(false)

/** First name only — "Setting things up, Maria" reads as addressed to a person. */
const firstName = computed(() => String(auth.user?.name ?? '').trim().split(/\s+/)[0] ?? '')

const progress = computed(() =>
  Math.round(((finished.value ? steps.length : activeStep.value) / steps.length) * 100),
)

const timers: ReturnType<typeof setTimeout>[] = []

onMounted(() => {
  const destination = (route.query.next as string) || auth.homePath()

  steps.forEach((_, index) => {
    if (index === 0) return

    timers.push(setTimeout(() => { activeStep.value = index }, STEP_MS * index))
  })

  timers.push(setTimeout(() => { finished.value = true }, STEP_MS * steps.length))
  timers.push(setTimeout(() => navigateTo(destination), STEP_MS * steps.length + SETTLE_MS))
})

// Without this, a user who navigates away mid-sequence is still yanked to the
// destination when the last timer fires against the unmounted component.
onUnmounted(() => timers.forEach(clearTimeout))
</script>

<template>
  <div class="preparing">
    <!--
      Ambient wash. Purely decorative and drifting slowly behind the content,
      so the screen reads as alive during the wait rather than frozen.
    -->
    <div aria-hidden="true" class="glow glow-one" />
    <div aria-hidden="true" class="glow glow-two" />

    <div class="relative flex w-full max-w-lg flex-col items-center px-6">
      <h1 class="wordmark font-heading">
        Batayan
      </h1>

      <p class="mt-3 text-center text-sm text-muted-foreground sm:text-base">
        <template v-if="firstName">
          Setting things up, <span class="font-medium text-foreground">{{ firstName }}</span>.
        </template>
        <template v-else>
          Setting up your workspace.
        </template>
      </p>

      <!--
        The checklist is the point: a spinner says "wait", a list ticking over
        says the work is real and specific to this account.
      -->
      <ol class="mt-10 w-full space-y-1" role="status" aria-live="polite">
        <li
          v-for="(step, index) in steps"
          :key="step"
          class="step"
          :class="{
            'step-done': finished || index < activeStep,
            'step-active': !finished && index === activeStep,
          }"
          :style="{ animationDelay: `${index * 90}ms` }"
        >
          <span class="marker">
            <CheckIcon v-if="finished || index < activeStep" class="size-3.5" />
            <span v-else-if="index === activeStep" class="spinner" />
            <span v-else class="pip" />
          </span>
          <span class="step-label">{{ step }}</span>
        </li>
      </ol>

      <div
        class="mt-10 h-1 w-full max-w-sm overflow-hidden rounded-full bg-border"
        role="progressbar"
        :aria-valuenow="progress"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-label="Preparing your workspace"
      >
        <div class="progress-fill" :style="{ width: `${progress}%` }" />
      </div>

      <Transition name="ready">
        <p v-if="finished" class="mt-5 text-sm font-medium text-primary">
          Your workspace is ready.
        </p>
      </Transition>
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

/* Ambient glows ---------------------------------------------------------- */

.glow {
  position: absolute;
  border-radius: 9999px;
  filter: blur(80px);
  pointer-events: none;
}

.glow-one {
  top: -6rem;
  right: -4rem;
  width: 26rem;
  height: 26rem;
  background: color-mix(in oklab, var(--color-primary) 22%, transparent);
  animation: drift-one 14s ease-in-out infinite;
}

.glow-two {
  bottom: -8rem;
  left: -5rem;
  width: 30rem;
  height: 30rem;
  background: color-mix(in oklab, var(--color-peach) 26%, transparent);
  animation: drift-two 18s ease-in-out infinite;
}

@keyframes drift-one {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(-2.5rem, 2rem, 0) scale(1.12); }
}

@keyframes drift-two {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1.06); }
  50% { transform: translate3d(2rem, -2.5rem, 0) scale(1); }
}

/* Wordmark --------------------------------------------------------------- */

.wordmark {
  /* Fluid rather than fixed: this is the one element that should dominate the
     screen on a laptop without overflowing a narrow phone. */
  font-size: clamp(3.25rem, 13vw, 6.5rem);
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.04em;
  /* The sweep rides across the text itself via background-clip, so the accent
     colour reads as light moving over the letterforms. Endpoints are the
     theme's own foreground, so it resolves correctly in light and dark. */
  background-image: linear-gradient(
    100deg,
    var(--color-foreground) 25%,
    var(--color-primary) 45%,
    var(--color-peach) 52%,
    var(--color-primary) 59%,
    var(--color-foreground) 78%
  );
  background-size: 250% 100%;
  background-position: 100% 0;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: sheen 4.5s ease-in-out infinite, rise 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes sheen {
  0%, 100% { background-position: 100% 0; }
  50% { background-position: 0 0; }
}

@keyframes rise {
  from { opacity: 0; transform: translateY(0.75rem); }
  to { opacity: 1; transform: translateY(0); }
}

/* Checklist -------------------------------------------------------------- */

.step {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.25rem;
  font-size: 0.9375rem;
  color: var(--color-muted-foreground);
  opacity: 0.45;
  transition: opacity 0.5s ease, color 0.5s ease;
  /*
   * Transform only, and `backwards` rather than `both`. A filled animation
   * keeps its last keyframe applied and outranks normal declarations, so an
   * entrance that ended on `opacity: 1` would pin every pending row fully lit
   * and defeat the dimming below. Opacity stays purely class-driven.
   */
  animation: step-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) backwards;
}

@keyframes step-in {
  from { transform: translateY(0.5rem); }
  to { transform: translateY(0); }
}

.step-active {
  opacity: 1;
  color: var(--color-foreground);
}

.step-done {
  opacity: 0.75;
}

.marker {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  flex-shrink: 0;
  color: var(--color-primary);
}

.pip {
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 9999px;
  background: currentColor;
  opacity: 0.4;
}

.spinner {
  width: 1rem;
  height: 1rem;
  border-radius: 9999px;
  border: 2px solid color-mix(in oklab, var(--color-primary) 25%, transparent);
  border-top-color: var(--color-primary);
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* The label slides a hair as it becomes current — enough to draw the eye down
   the list without the row jumping. */
.step-label {
  transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.step-active .step-label {
  transform: translateX(0.125rem);
}

/* Progress --------------------------------------------------------------- */

.progress-fill {
  height: 100%;
  border-radius: 9999px;
  background: linear-gradient(90deg, var(--color-primary), var(--color-peach));
  /* Driven off the step state rather than a fixed keyframe, so the bar and the
     checklist can never drift out of sync. */
  transition: width 0.7s cubic-bezier(0.16, 1, 0.3, 1);
}

.ready-enter-active {
  transition: opacity 0.5s ease, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.ready-enter-from {
  opacity: 0;
  transform: translateY(0.5rem);
}

/* Motion preferences ------------------------------------------------------ */

@media (prefers-reduced-motion: reduce) {
  .glow,
  .wordmark,
  .step,
  .spinner {
    animation: none;
  }

  .wordmark {
    /* No sweep, so paint the text normally rather than leaving it transparent. */
    background-image: none;
    color: var(--color-foreground);
  }

  .progress-fill,
  .step,
  .step-label,
  .ready-enter-active {
    transition-duration: 0.01ms;
  }
}
</style>
