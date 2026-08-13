<script setup lang="ts">
import {
  CircleHelpIcon,
  XIcon,
  MessageSquareTextIcon,
  SparklesIcon,
  LightbulbIcon,
  BookOpenIcon,
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

const panelStyle = ref<Record<string, string>>({})

const GAP = 8

async function reposition() {
  if (!open.value) return

  const trigger = triggerEl.value
  const panel = panelEl.value
  if (!trigger || !panel) return

  const r = trigger.getBoundingClientRect()
  const pw = panel.offsetWidth
  const ph = panel.offsetHeight

  let left = r.left + r.width / 2 - pw / 2
  left = Math.max(GAP, Math.min(left, window.innerWidth - pw - GAP))

  let top = r.top - ph - GAP
  if (top < GAP) top = Math.min(r.bottom + GAP, window.innerHeight - ph - GAP)

  panelStyle.value = { left: `${left}px`, top: `${top}px` }
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
</script>

<template>
  <div ref="triggerEl" class="shrink-0">
    <Button
      type="button"
      variant="ghost"
      size="icon"
      class="h-10 w-10 rounded-xl text-muted-foreground hover:text-foreground"
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
      enter-from-class="opacity-0 translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-1"
    >
      <div
        v-if="open"
        id="chat-help-guide-panel"
        ref="panelEl"
        role="dialog"
        aria-modal="false"
        aria-label="How to get the most out of Batayan"
        class="fixed z-[120] w-[min(460px,calc(100vw-1rem))] rounded-2xl border bg-background shadow-xl"
        :style="panelStyle"
      >
        <div class="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div class="flex items-center gap-2">
            <span class="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
              <SparklesIcon class="size-4" />
            </span>
            <div>
              <p class="text-sm font-semibold leading-tight">How to use this chat</p>
              <p class="text-[11px] text-muted-foreground">{{ sectionHeading }}</p>
            </div>
          </div>
          <button
            type="button"
            class="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close help"
            @click="open = false"
          >
            <XIcon class="size-4" />
          </button>
        </div>

        <div class="max-h-[min(60dvh,24rem)] overflow-y-auto px-4 py-3">
          <div class="flex items-start gap-2.5">
            <MessageSquareTextIcon class="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p class="text-xs font-semibold">Ask a clear question</p>
              <ul class="mt-1 space-y-1 text-xs leading-relaxed text-muted-foreground">
                <li>· Give specifics — dates, places, parties, amounts.</li>
                <li>· State your goal, not just the legal topic.</li>
                <li>· Ask one question at a time for sharper answers.</li>
                <li>· Follow up with "What law or case supports this?"</li>
              </ul>
            </div>
          </div>

          <Separator class="my-3" />

          <div class="flex items-start gap-2.5">
            <BookOpenIcon class="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p class="text-xs font-semibold">What Batayan can do</p>
              <ul class="mt-1 space-y-1 text-xs leading-relaxed text-muted-foreground">
                <li>· Explain statutes, Supreme Court rulings, and legal terms.</li>
                <li>· Draft letters, pleadings, and documents.</li>
                <li>· Summarize or analyze your uploaded files.</li>
                <li>· Spot risks and outline next steps.</li>
              </ul>
            </div>
          </div>

          <Separator class="my-3" />

          <div class="flex items-start gap-2.5">
            <LightbulbIcon class="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p class="text-xs font-semibold">Make each session count</p>
              <ul class="mt-1 space-y-1 text-xs leading-relaxed text-muted-foreground">
                <li v-if="context === 'case'">· Keep related questions in this thread so the facts carry over.</li>
                <li v-else>· Start a new chat for an unrelated topic to keep answers focused.</li>
                <li>· Attach the actual documents so answers use your facts.</li>
                <li>· Use suggested next steps to keep momentum.</li>
                <li>· Verify important details against the cited sources.</li>
              </ul>
            </div>
          </div>
        </div>

        <p class="border-t px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground/80">
          Batayan AI can make mistakes — always verify important legal details before acting on them.
        </p>
      </div>
    </Transition>
  </Teleport>
</template>