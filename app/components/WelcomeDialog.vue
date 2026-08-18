<script setup lang="ts">
import { FileTextIcon, MessagesSquareIcon, ScaleIcon } from '@lucide/vue'

/**
 * The close of first-run: shown once, whether the user finished the tour or
 * skipped it, then never again.
 *
 * It offers the two things a new account can actually do rather than only an
 * acknowledgement button — the moment someone dismisses this is the moment
 * they need somewhere to go.
 */
const tour = useProductTour()
const auth = useAuthStore()

const firstName = computed(() => (auth.user?.name ?? '').trim().split(/\s+/)[0] ?? '')

const isLawyer = computed(() => auth.isVerifiedLawyer)

/** A lawyer has just walked the workspace, so the close points back at it. */
const description = computed(() =>
  isLawyer.value
    ? 'Review and notarize documents from your workspace, or ask a question about Philippine law. Every answer comes with the sources it relied on.'
    : 'Ask a question about Philippine law, or open a case and let Batayan work from your own documents. Every answer comes with the sources it relied on.',
)

const dialog = ref<HTMLElement | null>(null)

function go(path: string) {
  tour.dismissWelcome()
  navigateTo(path)
}

function onKeydown(event: KeyboardEvent) {
  if (tour.welcoming.value && event.key === 'Escape') tour.dismissWelcome()
}

// Move focus into the dialog when it opens, so keyboard and screen-reader
// users land on it rather than staying behind the backdrop.
watch(
  () => tour.welcoming.value,
  async (open) => {
    if (!open) return
    await nextTick()
    dialog.value?.querySelector<HTMLElement>('button')?.focus()
  },
)

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="tour.welcoming.value"
        class="fixed inset-0 z-[110] flex items-center justify-center p-4 backdrop-blur-md"
        style="background: rgb(0 0 0 / 0.35)"
        @click.self="tour.dismissWelcome()"
      >
        <div
          ref="dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="welcome-title"
          class="dialog-panel-in w-full max-w-md rounded-2xl border bg-popover p-7 text-center shadow-2xl"
        >
          <div
            class="dialog-reveal mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10"
            style="--reveal-delay: 0.16s"
          >
            <span class="size-3 rounded-full bg-primary" />
          </div>

          <h2
            id="welcome-title"
            class="dialog-reveal mt-4 font-heading text-2xl font-bold tracking-tight"
            style="--reveal-delay: 0.22s"
          >
            Welcome to Batayan<span v-if="firstName">, {{ firstName }}</span>!
          </h2>

          <p
            class="dialog-reveal mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground"
            style="--reveal-delay: 0.28s"
          >
            {{ description }}
          </p>

          <div class="dialog-reveal mt-6 grid gap-2 sm:grid-cols-2" style="--reveal-delay: 0.35s">
            <template v-if="isLawyer">
              <Button class="w-full gap-1.5" @click="go('/lawyer/dashboard')">
                <ScaleIcon class="size-4" />
                Go to my workspace
              </Button>
              <Button variant="outline" class="w-full gap-1.5" @click="go('/chat')">
                <MessagesSquareIcon class="size-4" />
                Ask a question
              </Button>
            </template>
            <template v-else>
              <Button class="w-full gap-1.5" @click="go('/chat')">
                <MessagesSquareIcon class="size-4" />
                Ask a question
              </Button>
              <Button variant="outline" class="w-full gap-1.5" @click="go('/cases')">
                <FileTextIcon class="size-4" />
                Create a case
              </Button>
            </template>
          </div>

          <button
            type="button"
            class="dialog-reveal mt-4 text-xs text-muted-foreground underline-offset-2 hover:underline"
            style="--reveal-delay: 0.42s"
            @click="tour.dismissWelcome()"
          >
            I'll explore on my own
          </button>

          <p
            class="dialog-reveal mt-4 text-[11px] text-muted-foreground/80"
            style="--reveal-delay: 0.48s"
          >
            You can replay the tour any time from the account menu.
          </p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
