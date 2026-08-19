<script setup lang="ts">
/**
 * The beat between "Create Case" and the case's own page.
 *
 * Creating a case is not one write: the server files it under a reference,
 * stores everything the intake form collected, and opens the General thread the
 * assistant answers in. That took a spinner on a button and then a hard cut to
 * a different page, which gave the user nothing to read and no sense that the
 * workspace they just described had actually been assembled.
 *
 * So the wait is spent showing the case being built — the title they typed,
 * their own type and status and priority landing as chips, the General thread
 * opening — and it ends on a stamped seal rather than a page swap. The card is
 * decorative; the status line underneath says the same thing as text.
 *
 * The animation never outruns the truth. Steps advance on a timer while the
 * request is in flight and hold on the last one until `done` arrives; only then
 * does it seal and emit `finished`. A fast server just means the remaining
 * steps play at speed instead of being skipped.
 */
import { CheckIcon, MessageSquareIcon } from '@lucide/vue'

const props = withDefaults(defineProps<{
  title: string
  caseType: string
  status: string
  priority?: string | null
  /** True once the server has answered and the case exists. */
  done: boolean
  /**
   * Set by the parent once the case page has actually arrived underneath. The
   * overlay holds its sealed "ready" state through the navigation and only
   * fades when this flips — otherwise the seal would vanish while the route is
   * still changing and briefly reveal the list behind it.
   */
  dismiss?: boolean
}>(), {
  dismiss: false,
})

const emit = defineEmits<{ finished: [] }>()

const { typeLabel, statusLabel, priorityLabel, statusDotClass } = useCasePresentation()

/** Each line names something the request genuinely does. */
const STEPS = [
  'Filing your case',
  'Saving the details you gave',
  'Opening your General thread',
] as const

const LAST_STEP = STEPS.length - 1

/** Unhurried while there is nothing to report yet. */
const STEP_MS = 1000
/**
 * Once the case exists the rest is a recap, so it plays faster — but not so
 * fast that a line goes by unread. A quick server should still feel like the
 * work was done, not like the screen was skipped.
 */
const FAST_MS = 360
/** A beat before the seal, so it reads as landing on finished work. */
const SEAL_MS = 240
/** And a beat on the seal itself, so it is seen rather than skipped past. */
const SETTLE_MS = 980

const active = ref(0)
const sealed = ref(false)
/** The parent flips this once the case page is mounted, so we fade over it. */
const leaving = computed(() => props.dismiss)

const timers: ReturnType<typeof setTimeout>[] = []

function later(fn: () => void, ms: number) {
  timers.push(setTimeout(fn, ms))
}

function clearTimers() {
  timers.forEach(clearTimeout)
  timers.length = 0
}

/** A part of the card is drawn once its step is current. */
function written(step: number) {
  return sealed.value || step <= active.value
}

const statusLine = computed(() => (sealed.value ? 'Your case is ready.' : STEPS[active.value]))

/**
 * The active step gets partial credit, so the bar creeps rather than sitting
 * still between jumps — a still bar reads as stalled.
 */
const progress = computed(() => {
  const done = sealed.value ? STEPS.length : active.value + 0.55
  return Math.round((done / STEPS.length) * 100)
})

/** Their own answers, read back. Priority is optional on the form. */
const chips = computed(() => {
  const list = [
    { key: 'type', label: typeLabel(props.caseType), dot: '' },
    { key: 'status', label: statusLabel(props.status), dot: statusDotClass(props.status) },
  ]
  if (props.priority) list.push({ key: 'priority', label: priorityLabel(props.priority), dot: '' })
  return list
})

/** Filler for the body of the card: the description and parties, as paper. */
const LINES = [70, 96, 84] as const

/** Advance one step at a time while the request is still out. */
function tick() {
  if (active.value >= LAST_STEP) return
  later(() => {
    active.value++
    tick()
  }, STEP_MS)
}

/**
 * Walk whatever steps are left at speed, then seal. Guarded because `done` can
 * flip while the wind-down is already running.
 */
function finish() {
  if (sealed.value) return
  clearTimers()

  const remaining = LAST_STEP - active.value
  for (let i = 1; i <= remaining; i++) {
    later(() => { active.value += 1 }, FAST_MS * i)
  }

  const sealAt = FAST_MS * remaining + SEAL_MS
  later(() => { sealed.value = true }, sealAt)
  later(() => {
    emit('finished')
    // Hold the sealed "ready" state; the parent fades us out only once the case
    // page has arrived, so the animation never cuts out before the redirect.
  }, sealAt + SETTLE_MS)
}

watch(() => props.done, (value) => { if (value) finish() }, { immediate: true })

onMounted(() => {
  if (!props.done) tick()
})

// The last timers would otherwise fire against an unmounted component, emitting
// a handover for a case whose page is already open.
onUnmounted(clearTimers)
</script>

<template>
  <Teleport to="body">
    <div class="prep" :class="{ 'prep-leaving': leaving }">
      <div class="prep-scrim" />

      <div class="relative flex w-full max-w-xs flex-col items-center px-6">
        <!--
          The case file being assembled. Decorative to a screen reader — the
          status line below carries the same information as text.
        -->
        <div class="file-wrap" aria-hidden="true">
          <div class="file-tab" />

          <div class="file" :class="{ 'file-sealed': sealed }">
            <div class="head">
              <span class="ref" :class="{ 'in': written(0) }" />
              <p class="title" :class="{ 'in': written(0) }">{{ props.title || 'Untitled case' }}</p>
            </div>

            <div class="chips">
              <span
                v-for="(chip, index) in chips"
                :key="chip.key"
                class="chip"
                :class="{ 'in': written(1) }"
                :style="{ transitionDelay: written(1) ? `${index * 90}ms` : '0ms' }"
              >
                <span v-if="chip.dot" class="chip-dot" :class="chip.dot" />
                {{ chip.label }}
              </span>
            </div>

            <div class="lines">
              <span
                v-for="(width, index) in LINES"
                :key="index"
                class="line"
                :class="{ 'in': written(1) }"
                :style="{ '--w': `${width}%`, transitionDelay: written(1) ? `${180 + index * 110}ms` : '0ms' }"
              />
            </div>

            <!-- The thread the server opens with every case. -->
            <div class="thread" :class="{ 'in': written(2) }">
              <MessageSquareIcon class="size-3.5 shrink-0" />
              <span>General</span>
            </div>

            <span class="seal" :class="{ 'in': sealed }">
              <CheckIcon class="size-5" :stroke-width="3" />
            </span>

            <!-- A pass of light while work is in flight, in place of a spinner. -->
            <div v-if="!sealed" class="scan" />
          </div>
        </div>

        <div class="status" role="status" aria-live="polite">
          <Transition name="prep-status" mode="out-in">
            <p :key="statusLine" class="status-line" :class="{ 'status-ready': sealed }">
              {{ statusLine }}
            </p>
          </Transition>
        </div>

        <div
          class="track"
          role="progressbar"
          :aria-valuenow="progress"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-label="Preparing your case"
        >
          <div class="fill" :style="{ width: `${progress}%` }" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Above the intake drawer (z-50), which stays mounted underneath so a failed
   create can hand the form back with everything still typed into it. */
.prep {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 1;
  transition: opacity 0.38s ease;
}

.prep-leaving {
  opacity: 0;
  pointer-events: none;
}

.prep-scrim {
  position: absolute;
  inset: 0;
  background: color-mix(in oklab, var(--color-background) 88%, transparent);
  backdrop-filter: blur(6px);
  animation: prep-in 0.25s ease both;
}

/* Case file ---------------------------------------------------------------- */

.file-wrap {
  position: relative;
  width: 100%;
  padding-top: 0.6875rem;
  animation: prep-rise 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
}

/* The tab is what makes the card read as a file rather than a dialog. */
.file-tab {
  position: absolute;
  top: 0;
  left: 1.25rem;
  width: 4.5rem;
  height: 0.875rem;
  border: 1px solid var(--color-border);
  border-bottom: none;
  border-radius: 0.375rem 0.375rem 0 0;
  background: color-mix(in oklab, var(--color-card) 82%, var(--color-background));
}

.file {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  background: var(--color-card);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.05), 0 24px 48px -28px rgb(0 0 0 / 0.45);
  overflow: hidden;
  transition: box-shadow 0.5s ease, border-color 0.5s ease;
}

.file-sealed {
  border-color: color-mix(in oklab, var(--color-primary) 45%, var(--color-border));
  box-shadow:
    0 1px 2px rgb(0 0 0 / 0.05),
    0 24px 48px -28px rgb(0 0 0 / 0.45),
    0 0 0 3px color-mix(in oklab, var(--color-primary) 12%, transparent);
}

.head {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-height: 2.75rem;
}

/* The reference is assigned server-side, so it stands in as a bar rather than
   showing a number that would turn out to be a different one. */
.ref {
  display: block;
  width: 0;
  height: 0.375rem;
  border-radius: 9999px;
  background: color-mix(in oklab, var(--color-muted-foreground) 35%, transparent);
  transition: width 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.ref.in {
  width: 3.5rem;
}

.title {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.3;
  color: var(--color-foreground);
  opacity: 0;
  transform: translateY(0.25rem);
  transition: opacity 0.45s ease 0.1s, transform 0.45s cubic-bezier(0.16, 1, 0.3, 1) 0.1s;
}

.title.in {
  opacity: 1;
  transform: none;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3125rem;
  min-height: 1.25rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3125rem;
  padding: 0.0625rem 0.4375rem;
  border: 1px solid var(--color-border);
  border-radius: 9999px;
  font-size: 0.6875rem;
  color: var(--color-muted-foreground);
  opacity: 0;
  transform: scale(0.9);
  transition: opacity 0.3s ease, transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.chip.in {
  opacity: 1;
  transform: none;
}

.chip-dot {
  width: 0.3125rem;
  height: 0.3125rem;
  border-radius: 9999px;
}

.lines {
  display: flex;
  flex-direction: column;
  gap: 0.4375rem;
  min-height: 2.5rem;
}

/* Grown from zero to their own width, so the body reads as being written out
   left to right rather than fading in as a block. */
.line {
  display: block;
  width: 0;
  height: 0.375rem;
  border-radius: 9999px;
  background: color-mix(in oklab, var(--color-muted-foreground) 28%, transparent);
  transition: width 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.line.in {
  width: var(--w);
}

.thread {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.4375rem 0.5rem;
  border: 1px solid color-mix(in oklab, var(--color-primary) 25%, transparent);
  border-radius: 0.5rem;
  background: color-mix(in oklab, var(--color-primary) 7%, transparent);
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-primary);
  opacity: 0;
  transform: translateY(0.375rem);
  transition: opacity 0.35s ease, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.thread.in {
  opacity: 1;
  transform: none;
}

/* Stamped, not faded in: overshoot then settle, slightly off-square like a
   seal pressed by hand. */
.seal {
  position: absolute;
  right: 0.875rem;
  bottom: 0.875rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border: 2px solid var(--color-primary);
  border-radius: 9999px;
  color: var(--color-primary);
  background: color-mix(in oklab, var(--color-primary) 10%, var(--color-card));
  opacity: 0;
  transform: scale(1.6) rotate(-18deg);
  transition: opacity 0.26s ease, transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.seal.in {
  opacity: 1;
  transform: scale(1) rotate(-7deg);
}

.scan {
  position: absolute;
  left: 0;
  right: 0;
  top: -45%;
  height: 45%;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    transparent,
    color-mix(in oklab, var(--color-primary) 10%, transparent),
    transparent
  );
  animation: prep-sweep 2.2s ease-in-out infinite;
}

/* Status ------------------------------------------------------------------- */

/* Fixed height, so swapping lines of different lengths never nudges the bar or
   the file above it. */
.status {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 1.75rem;
  margin-top: 1.5rem;
}

.status-line {
  font-size: 0.875rem;
  font-weight: 500;
  text-align: center;
  color: var(--color-foreground);
}

.status-ready {
  color: var(--color-primary);
}

.prep-status-enter-active,
.prep-status-leave-active {
  transition: opacity 0.22s ease, transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}

.prep-status-enter-from {
  opacity: 0;
  transform: translateY(0.35rem);
}

.prep-status-leave-to {
  opacity: 0;
  transform: translateY(-0.35rem);
}

.track {
  width: 100%;
  max-width: 12rem;
  height: 0.25rem;
  margin-top: 0.75rem;
  overflow: hidden;
  border-radius: 9999px;
  background: color-mix(in oklab, var(--color-muted-foreground) 20%, transparent);
}

.fill {
  height: 100%;
  border-radius: 9999px;
  background: var(--color-primary);
  /* Driven off the step state rather than a fixed keyframe, so the bar and the
     file can never drift out of sync. */
  transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes prep-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes prep-rise {
  from { opacity: 0; transform: translateY(0.75rem) scale(0.98); }
  to { opacity: 1; transform: none; }
}

@keyframes prep-sweep {
  0% { transform: translateY(0); }
  100% { transform: translateY(330%); }
}

/* Motion preferences ------------------------------------------------------- */

@media (prefers-reduced-motion: reduce) {
  .file-wrap,
  .prep-scrim {
    animation: none;
  }

  .scan {
    display: none;
  }

  .seal {
    transform: rotate(-7deg);
  }

  .prep,
  .file,
  .ref,
  .title,
  .chip,
  .line,
  .thread,
  .seal,
  .fill,
  .prep-status-enter-active,
  .prep-status-leave-active {
    transition-duration: 0.01ms;
  }

  .title,
  .thread,
  .prep-status-enter-from,
  .prep-status-leave-to {
    transform: none;
  }
}
</style>
