<script setup lang="ts">
import {
  BookOpenIcon,
  CheckIcon,
  CircleHelpIcon,
  CopyIcon,
  LightbulbIcon,
  MessageSquareTextIcon,
  ScaleIcon,
  SparklesIcon,
  XIcon,
} from '@lucide/vue'
import { onClickOutside } from '@vueuse/core'

/**
 * A "?" button beside the composer that opens a short guide on how to ask
 * questions and get more out of a session. Content is tuned by the context it
 * is shown in (general research vs. a case conversation).
 */
const props = withDefaults(
  defineProps<{
    context?: 'general' | 'case'
  }>(),
  { context: 'general' },
)

const open = ref(false)
const triggerEl = ref<HTMLElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)

const panelStyle = ref<Record<string, string>>({ transformOrigin: 'bottom center' })
const arrowStyle = ref<Record<string, string>>({})
const placement = ref<'above' | 'below'>('above')
const copied = ref<string | null>(null)

const GAP = 8
const ARROW = 8

function limit(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

async function reposition() {
  if (!open.value) return

  const trigger = triggerEl.value
  const panel = panelEl.value
  if (!trigger || !panel) return

  const r = trigger.getBoundingClientRect()
  const pw = panel.offsetWidth
  const ph = panel.offsetHeight

  let left = r.left + r.width / 2 - pw / 2
  left = limit(left, GAP, window.innerWidth - pw - GAP)

  // Prefer floating above the trigger, flipped below when there is no room.
  let top = r.top - ph - GAP - ARROW
  placement.value = 'above'
  if (top < GAP) {
    top = Math.min(r.bottom + GAP + ARROW, window.innerHeight - ph - GAP)
    placement.value = 'below'
  }

  panelStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    transformOrigin: placement.value === 'above' ? 'bottom center' : 'top center',
  }

  const arrowLeft = limit(r.left + r.width / 2 - left, GAP + ARROW, pw - GAP - ARROW)
  arrowStyle.value = { left: `${arrowLeft}px` }
}

function toggle() {
  open.value = !open.value
  if (open.value) nextTick(() => reposition())
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}

onClickOutside(panelEl, () => { open.value = false }, { ignore: [triggerEl] })

watch(open, (isOpen) => {
  if (isOpen) {
    window.addEventListener('keydown', onKeydown)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    nextTick(() => panelEl.value?.querySelector<HTMLElement>('button')?.focus())
  } else {
    window.removeEventListener('keydown', onKeydown)
    window.removeEventListener('resize', reposition)
    window.removeEventListener('scroll', reposition, true)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', reposition)
  window.removeEventListener('scroll', reposition, true)
})

const sectionHeading = computed(() =>
  props.context === 'case'
    ? 'Ask about this case, draft from its facts, or plan next steps.'
    : 'Ask about Philippine law, your documents, or what to do next.',
)

const sections = computed(() => [
  {
    icon: MessageSquareTextIcon,
    title: 'Ask a clear question',
    items: [
      'Give specifics — dates, places, parties, amounts.',
      'State your goal, not just the legal topic.',
      'Ask one question at a time for sharper answers.',
      'Follow up with "What law or case supports this?"',
    ],
  },
  {
    icon: BookOpenIcon,
    title: 'What Batayan can do',
    items: [
      'Explain statutes, Supreme Court rulings, and legal terms.',
      'Draft letters, pleadings, and documents.',
      'Summarize or analyze your uploaded files.',
      'Spot risks and outline next steps.',
    ],
  },
  {
    icon: LightbulbIcon,
    title: 'Make each session count',
    items: props.context === 'case'
      ? [
          'Keep related questions in this thread so the facts carry over.',
          'Attach the actual documents so answers use your facts.',
          'Use suggested next steps to keep momentum.',
          'Verify important details against the numbered sources in each answer.',
        ]
      : [
          'Start a new chat for an unrelated topic to keep answers focused.',
          'Attach the actual documents so answers use your facts.',
          'Use suggested next steps to keep momentum.',
          'Verify important details against the numbered sources in each answer.',
        ],
  },
])

const quickPrompts = computed<string[]>(() => {
  if (props.context === 'case') {
    return [
      'Summarize the key facts of this case',
      "Draft a reply to the opposing party's answer",
      'What should we do next in this case?',
    ]
  }
  return [
    'Explain the difference between a summons and a subpoena',
    'Draft a demand letter for unpaid rent',
    'What rights do tenants have in the Philippines?',
  ]
})

async function copyPrompt(prompt: string) {
  try {
    await navigator.clipboard.writeText(prompt)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = prompt
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  }
  copied.value = prompt
  window.setTimeout(() => {
    if (copied.value === prompt) copied.value = null
  }, 1400)
}
</script>

<template>
  <div ref="triggerEl" class="shrink-0">
    <Button
      type="button"
      variant="ghost"
      size="icon"
      class="h-10 w-10 rounded-xl text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
      :class="open ? 'bg-primary/10 text-primary' : ''"
      :aria-expanded="open"
      aria-controls="chat-help-guide-panel"
      title="How to use this chat"
      :aria-label="open ? 'Close chat help' : 'Chat help'"
      @click="toggle"
    >
      <CircleHelpIcon class="size-4" />
      <span class="sr-only">Chat help</span>
    </Button>
  </div>

  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="open"
        id="chat-help-guide-panel"
        ref="panelEl"
        role="dialog"
        aria-modal="false"
        aria-label="How to get the most out of Batayan"
        class="fixed z-[120] w-[min(460px,calc(100vw-1rem))] rounded-2xl border bg-popover shadow-float"
        :style="panelStyle"
      >
        <!-- Hairline top edge that reads as brand light falling on the panel. -->
        <span
          class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
        />

        <!-- Caret pointing back at the trigger. -->
        <span
          class="pointer-events-none absolute size-3 rotate-45 border bg-popover"
          :style="arrowStyle"
          :class="placement === 'above'
            ? '-bottom-[5px] border-t-0 border-l-0 border-border/80'
            : '-top-[5px] border-b-0 border-r-0 border-border/80'"
        />

        <header
          class="flex items-start justify-between gap-3 border-b border-border/60 px-5 pb-4 pt-5 shadow-[0_6px_14px_-8px_rgb(74_35_23/0.25)] dark:shadow-[0_6px_14px_-8px_rgb(0_0_0/0.55)]"
        >
          <div class="flex min-w-0 items-start gap-3">
            <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
              <ScaleIcon class="size-5" />
            </span>
            <div class="min-w-0">
              <p class="font-heading text-base font-semibold leading-tight">How to use this chat</p>
              <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">{{ sectionHeading }}</p>
            </div>
          </div>
          <button
            type="button"
            class="-mr-1.5 -mt-1.5 shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close help"
            @click="open = false"
          >
            <XIcon class="size-4" />
          </button>
        </header>

        <div class="max-h-[min(58dvh,22rem)] overflow-y-auto px-5 pb-5 pt-4">
          <section
            v-for="(section, index) in sections"
            :key="section.title"
            class="flex items-start gap-3"
            :class="index > 0 ? 'mt-4' : ''"
          >
            <span class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <component :is="section.icon" class="size-4" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-[13px] font-semibold">{{ section.title }}</p>
              <ul class="mt-1.5 space-y-1.5">
                <li
                  v-for="item in section.items"
                  :key="item"
                  class="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"
                >
                  <span class="mt-1.5 size-1 shrink-0 rounded-full bg-primary/50" />
                  <span>{{ item }}</span>
                </li>
              </ul>
            </div>
          </section>

          <Separator class="my-4" />

          <div>
            <p class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <SparklesIcon class="size-3.5" />
              Try one of these
            </p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <button
                v-for="prompt in quickPrompts"
                :key="prompt"
                type="button"
                class="inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-xs font-medium text-foreground/85 transition-colors hover:border-primary/35 hover:bg-primary/10 hover:text-foreground"
                :title="copied === prompt ? 'Copied to clipboard' : 'Copy this prompt'"
                @click="copyPrompt(prompt)"
              >
                <CheckIcon v-if="copied === prompt" class="size-3 shrink-0 text-primary" />
                <CopyIcon v-else class="size-3 shrink-0 text-primary/70" />
                <span class="min-w-0 truncate">{{ prompt }}</span>
              </button>
            </div>
            <p class="mt-1.5 text-[10px] text-muted-foreground/70">
              Click a prompt to copy it, then paste it into the chat.
            </p>
          </div>
        </div>

        <footer class="flex items-start gap-2.5 border-t bg-muted/30 px-5 py-3">
          <span class="mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ScaleIcon class="size-2.5" />
          </span>
          <p class="text-[11px] leading-relaxed text-muted-foreground/90">
            Batayan AI can make mistakes — always verify important legal details before acting on them.
          </p>
        </footer>
      </div>
    </Transition>
  </Teleport>
</template>
