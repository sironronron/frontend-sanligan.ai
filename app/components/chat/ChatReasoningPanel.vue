<script setup lang="ts">
import { CheckIcon, ChevronRightIcon, GlobeIcon } from '@lucide/vue'
import ChatWebSearchTrail from '~/components/chat/ChatWebSearchTrail.vue'
import type { ChatActivityStep, ChatWebSearch } from '~/types/chat'

/**
 * What the assistant did to produce the answer.
 *
 * Two lives, one component:
 *
 * - **While the turn runs** it is open and live. The current step is named and
 *   shimmering, finished steps sit above it ticked off, and the web search
 *   trail nests inside the step it belongs to. This is the only thing on
 *   screen during the wait, so it has to be worth reading.
 * - **Once the answer starts arriving** it folds itself into a single quiet
 *   line — "Worked for 8s · read 4 sources" — above the reply. The work is no
 *   longer the story; the answer is. The line stays expandable, and because
 *   the steps are persisted on the message it is still there tomorrow.
 *
 * The auto-fold happens once, on the transition into writing, and is not
 * re-applied afterwards: a reader who opens the panel back up while the answer
 * is still streaming must not have it shut on them again.
 */
const props = defineProps<{
  steps: ChatActivityStep[]
  /** The turn is still working; false for a persisted, finished answer. */
  live: boolean
  /** True once the answer text has begun arriving. */
  writing: boolean
  /** Milliseconds the turn took, when known. */
  durationMs?: number | null
  /** Sources read, for the collapsed summary. */
  webSources?: number
  /** The search happening right now; cleared when it ends. */
  webSearch?: ChatWebSearch | null
}>()

const open = ref(props.live && !props.writing)
const userToggled = ref(false)

watch(
  () => props.writing,
  (writing) => {
    // The reader's own choice always wins over the automatic fold.
    if (writing && !userToggled.value) open.value = false
  },
)

function toggle() {
  userToggled.value = true
  open.value = !open.value
}

const activeStep = computed(() => props.steps.find((step) => step.state === 'active') ?? null)

/**
 * The one-line account shown when the panel is folded.
 *
 * While the turn is running it names the step in progress, because that is the
 * thing the reader is waiting on. Once it is over it reports the shape of the
 * work — how long, how many sources — which is what a reader coming back to
 * the answer later actually wants to know.
 */
const summary = computed(() => {
  if (props.live && activeStep.value) return activeStep.value.label

  const parts: string[] = []

  if (props.durationMs && props.durationMs >= 1000) {
    parts.push(`Worked for ${Math.round(props.durationMs / 1000)}s`)
  } else {
    parts.push(props.steps.length > 0 ? `${props.steps.length} steps` : 'How this was worked out')
  }

  if (props.webSources && props.webSources > 0) {
    parts.push(`read ${props.webSources} ${props.webSources === 1 ? 'source' : 'sources'}`)
  }

  return parts.join(' · ')
})

function rowDelay(index: number): string {
  return `${Math.min(index * 55, 275)}ms`
}
</script>

<template>
  <section
    class="w-full overflow-hidden rounded-xl border transition-colors duration-300"
    :class="
      live && !writing
        ? 'batayan-sheen border-primary/25 bg-primary/[0.045]'
        : 'border-border/70 bg-muted/25'
    "
  >
    <button
      type="button"
      class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-foreground/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      :aria-expanded="open"
      @click="toggle"
    >
      <ChevronRightIcon
        class="size-3.5 shrink-0 text-muted-foreground transition-transform duration-300"
        :class="open ? 'rotate-90' : ''"
      />
      <span
        class="min-w-0 flex-1 truncate font-medium"
        :class="live && !writing ? 'batayan-shimmer-text' : 'text-muted-foreground'"
      >
        {{ summary }}
      </span>
      <span v-if="live && !writing" class="flex shrink-0 items-center gap-1 text-primary">
        <span class="batayan-dot" />
        <span class="batayan-dot" style="--dot-delay: 0.15s" />
        <span class="batayan-dot" style="--dot-delay: 0.3s" />
      </span>
      <span
        v-else-if="webSources"
        class="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground/80"
      >
        <GlobeIcon class="size-3" />
        {{ webSources }}
      </span>
    </button>

    <div class="batayan-collapse" :data-open="open">
      <div>
        <ol class="space-y-0 px-3 pb-2.5">
          <li
            v-for="(step, index) in steps"
            :key="step.key"
            class="batayan-row-in relative flex gap-2.5 pb-2 last:pb-0"
            :style="{ '--row-delay': rowDelay(index) }"
          >
            <!-- The rail runs from under this bullet to the next one, so it
                 stays unbroken however tall a row wraps to. -->
            <span
              v-if="index < steps.length - 1"
              class="absolute bottom-0 left-[7px] top-4 w-px -translate-x-1/2 transition-colors duration-300"
              :class="step.state === 'done' ? 'bg-primary/25' : 'bg-border'"
              aria-hidden="true"
            />
            <span
              class="relative mt-[3px] flex size-3.5 shrink-0 items-center justify-center rounded-full transition-colors duration-300"
              :class="[
                step.state === 'done'
                  ? 'bg-primary/15 text-primary'
                  : step.state === 'active'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground/50',
              ]"
            >
              <span
                v-if="step.state === 'active'"
                class="batayan-pulse-ring absolute inset-0 rounded-full bg-primary/40"
                aria-hidden="true"
              />
              <CheckIcon v-if="step.state === 'done'" class="size-2.5" />
              <span v-else-if="step.state === 'active'" class="relative size-1 rounded-full bg-current" />
              <span v-else class="size-1 rounded-full bg-current" />
            </span>
            <span
              class="min-w-0 flex-1 text-xs leading-5 transition-colors duration-300"
              :class="
                step.state === 'active'
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground/80'
              "
            >
              {{ step.label }}
            </span>
          </li>
        </ol>

        <!-- Nested under the steps, not beside them: the sites being read are
             detail belonging to the search step, not a step of their own. -->
        <ChatWebSearchTrail v-if="webSearch" :search="webSearch" class="mx-3 mb-3" />
      </div>
    </div>
  </section>
</template>
