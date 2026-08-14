<script setup lang="ts">
import { XIcon } from '@lucide/vue'

/**
 * Renders the active tour step: a dimmed page with the target element cut out,
 * and a tooltip beside it.
 *
 * The cut-out is drawn as a single div with a very large spread box-shadow
 * rather than four separate overlay panels — one element means no seams
 * between them and nothing to keep in sync while the page scrolls.
 */
const tour = useProductTour()
const route = useRoute()

const rect = ref<DOMRect | null>(null)
const missing = ref(false)

const GAP = 8
const TOOLTIP_WIDTH = 340

/** Wait for the step's anchor to exist — a route change renders it a tick late. */
async function locate(): Promise<void> {
  const step = tour.step.value

  if (!step) return

  missing.value = false

  // Navigate first when the step lives on another page.
  if (step.route && route.path !== step.route) {
    await navigateTo(step.route)
  }

  for (let attempt = 0; attempt < 40; attempt++) {
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)

    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      await new Promise((resolve) => setTimeout(resolve, 120))
      rect.value = el.getBoundingClientRect()

      return
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  // The anchor never appeared — the feature may be hidden for this user (an
  // empty state, a collapsed panel). Show the copy centred rather than
  // spotlighting nothing, so the tour still explains the feature.
  missing.value = true
  rect.value = null
}

const tooltipStyle = computed(() => {
  const r = rect.value

  if (!r) {
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }

  const placement = tour.step.value?.placement ?? 'bottom'
  const width = Math.min(TOOLTIP_WIDTH, window.innerWidth - 2 * GAP)

  let top = r.bottom + GAP
  let left = r.left + r.width / 2 - width / 2

  if (placement === 'top') top = Math.max(GAP, r.top - GAP - 190)
  if (placement === 'left') {
    top = r.top
    left = r.left - width - GAP
  }
  if (placement === 'right') {
    top = r.top
    left = r.right + GAP
  }

  // Keep the tooltip on screen regardless of where the anchor sits.
  left = Math.min(Math.max(GAP, left), window.innerWidth - width - GAP)
  top = Math.min(Math.max(GAP, top), window.innerHeight - 210)

  return { top: `${top}px`, left: `${left}px`, width: `${width}px` }
})

const cutoutStyle = computed(() => {
  const r = rect.value

  if (!r) return { display: 'none' }

  const pad = 6

  return {
    top: `${r.top - pad}px`,
    left: `${r.left - pad}px`,
    width: `${r.width + pad * 2}px`,
    height: `${r.height + pad * 2}px`,
  }
})

function onKeydown(event: KeyboardEvent) {
  if (!tour.active.value) return

  if (event.key === 'Escape') tour.finish()
  if (event.key === 'ArrowRight') tour.next()
  if (event.key === 'ArrowLeft') tour.back()
}

function reposition() {
  void locate()
}

watch(() => tour.step.value, () => void locate(), { immediate: true })

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', reposition)
  // Capture phase: the highlighted element often sits inside its own scroll
  // container, whose scroll events do not bubble to window.
  window.addEventListener('scroll', reposition, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', reposition)
  window.removeEventListener('scroll', reposition, true)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="tour.active.value && tour.step.value" class="pointer-events-none fixed inset-0 z-[100]">
      <!-- Dim everything except the target. -->
      <div
        v-if="rect"
        class="pointer-events-none absolute rounded-lg ring-2 ring-primary transition-all duration-200"
        :style="cutoutStyle"
        style="box-shadow: 0 0 0 9999px rgb(0 0 0 / 0.55)"
      />
      <div v-else class="pointer-events-auto absolute inset-0 bg-black/55" @click="tour.finish()" />

      <div
        class="pointer-events-auto absolute rounded-xl border bg-popover p-4 shadow-xl transition-all duration-200"
        :style="tooltipStyle"
        role="dialog"
        aria-live="polite"
        :aria-label="tour.step.value.title"
      >
        <div class="flex items-start justify-between gap-3">
          <p class="text-sm font-semibold">{{ tour.step.value.title }}</p>
          <button
            type="button"
            class="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Skip tour"
            @click="tour.finish()"
          >
            <XIcon class="size-4" />
          </button>
        </div>

        <p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">{{ tour.step.value.body }}</p>

        <p v-if="missing" class="mt-2 text-xs text-muted-foreground/80">
          This appears once you have something here to work with.
        </p>

        <div class="mt-4 flex items-center justify-between gap-3">
          <div class="flex items-center gap-1.5" aria-hidden="true">
            <span
              v-for="i in tour.total.value"
              :key="i"
              class="size-1.5 rounded-full transition-colors"
              :class="i - 1 === tour.index.value ? 'bg-primary' : 'bg-muted-foreground/25'"
            />
          </div>

          <div class="flex items-center gap-2">
            <Button v-if="tour.index.value > 0" variant="ghost" size="sm" @click="tour.back()">
              Back
            </Button>
            <Button size="sm" @click="tour.next()">
              {{ tour.step.value.cta ?? (tour.isLast.value ? 'Done' : 'Next') }}
            </Button>
          </div>
        </div>

        <button
          v-if="!tour.isLast.value"
          type="button"
          class="mt-2 text-xs text-muted-foreground underline-offset-2 hover:underline"
          @click="tour.finish()"
        >
          Skip the tour
        </button>
      </div>
    </div>
  </Teleport>
</template>
