<script setup lang="ts">
import {
  BookOpenTextIcon,
  FileSearchIcon,
  FolderOpenIcon,
  MessagesSquareIcon,
  PaperclipIcon,
  ScaleIcon,
} from '@lucide/vue'

/**
 * The opening of first-run, shown before the first spotlight step.
 *
 * A spotlight can only explain the control it points at, so someone who has
 * never seen Batayan meets their first tooltip without knowing what the
 * product is for. This frames the whole thing first — what it does, in the
 * order it is used — and then lets the user choose whether the walkthrough is
 * worth their time.
 */
const tour = useProductTour()
const auth = useAuthStore()

const firstName = computed(() => (auth.user?.name ?? '').trim().split(/\s+/)[0] ?? '')

const dialog = ref<HTMLElement | null>(null)

/** A verified lawyer lands on the workspace, so the framing follows that. */
const isLawyer = computed(() => auth.isVerifiedLawyer)

const highlights = computed(() =>
  isLawyer.value
    ? [
        {
          icon: ScaleIcon,
          title: 'Work offered to you',
          body: 'Keep your availability on to receive document vetting and notarization requests matched to your practice. Review each one and accept what fits.',
        },
        {
          icon: FileSearchIcon,
          title: 'Review end to end',
          body: 'Open the submitted document, ask the submitter for anything you need, mark it vetted, and schedule a remote notarization — all on one page.',
        },
        {
          icon: BookOpenTextIcon,
          title: 'Keep an official journal',
          body: 'Every notarization you record is captured into your notarial journal with its certificate number.',
        },
      ]
    : [
        {
          icon: MessagesSquareIcon,
          title: 'Ask in plain language',
          body: 'Put the question the way you would to a colleague. Answers come from statutes, jurisprudence, and official issuances — with the sources attached.',
        },
        {
          icon: FolderOpenIcon,
          title: 'Keep a matter together',
          body: 'A case holds its facts, conversations, deadlines, and files in one place, so you never re-explain the background.',
        },
        {
          icon: PaperclipIcon,
          title: 'Work from your files',
          body: 'Upload contracts, titles, or notices — even phone photos. Batayan reads them and quotes them back with the filename.',
        },
      ],
)

const description = computed(() =>
  isLawyer.value
    ? 'Your workspace for vetting and notarizing documents, alongside the full research assistant for Philippine law. Here is what you get, in the order most people use it.'
    : 'A legal research assistant for Philippine law that shows its work. Here is what you get, in the order most people use it.',
)

function onKeydown(event: KeyboardEvent) {
  if (tour.introducing.value && event.key === 'Escape') tour.skipIntro()
}

// Move focus into the dialog when it opens, so keyboard and screen-reader
// users land on it rather than staying behind the backdrop.
watch(
  () => tour.introducing.value,
  async (open) => {
    if (!open) return
    await nextTick()
    dialog.value?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  },
  { immediate: true },
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
        v-if="tour.introducing.value"
        class="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto p-4 backdrop-blur-md"
        style="background: rgb(0 0 0 / 0.35)"
      >
        <div
          ref="dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-intro-title"
          class="dialog-panel-in my-auto w-full max-w-3xl rounded-2xl border bg-popover p-7 text-center shadow-2xl sm:p-9"
        >
          <div
            class="dialog-reveal mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10"
            style="--reveal-delay: 0.16s"
          >
            <span class="size-3 rounded-full bg-primary" />
          </div>

          <h2
            id="tour-intro-title"
            class="dialog-reveal mt-4 font-heading text-2xl font-bold tracking-tight sm:text-3xl"
            style="--reveal-delay: 0.22s"
          >
            Welcome to Batayan<span v-if="firstName">, {{ firstName }}</span>!
          </h2>

          <p
            class="dialog-reveal mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground"
            style="--reveal-delay: 0.28s"
          >
            {{ description }}
          </p>

          <div class="mt-7 grid gap-4 text-left sm:grid-cols-3">
            <div
              v-for="(item, i) in highlights"
              :key="item.title"
              class="dialog-reveal rounded-xl border bg-muted/30 p-4"
              :style="{ '--reveal-delay': `${0.34 + i * 0.06}s` }"
            >
              <div class="flex items-center gap-2">
                <span
                  class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                >
                  <component :is="item.icon" class="size-4" />
                </span>
                <span class="text-xs font-semibold text-muted-foreground/70">Step {{ i + 1 }}</span>
              </div>

              <p class="mt-3 text-sm font-semibold">{{ item.title }}</p>
              <p class="mt-1 text-xs leading-relaxed text-muted-foreground">{{ item.body }}</p>
            </div>
          </div>

          <p
            class="dialog-reveal mx-auto mt-6 max-w-lg text-xs leading-relaxed text-muted-foreground"
            style="--reveal-delay: 0.56s"
          >
            The walkthrough is about a minute — {{ tour.total.value }}
            {{ tour.total.value === 1 ? 'stop' : 'stops' }} through the app, and you can leave it at
            any point.
          </p>

          <div
            class="dialog-reveal mt-5 flex flex-col-reverse items-center justify-center gap-2 sm:flex-row"
            style="--reveal-delay: 0.62s"
          >
            <Button variant="ghost" class="w-full sm:w-auto" @click="tour.skipIntro()">
              Skip for now
            </Button>
            <Button data-autofocus class="w-full sm:w-auto" @click="tour.beginTour()">
              Show me around
            </Button>
          </div>

          <p
            class="dialog-reveal mt-4 text-[11px] text-muted-foreground/80"
            style="--reveal-delay: 0.68s"
          >
            You can replay the tour any time from the account menu.
          </p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
