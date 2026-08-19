<script setup lang="ts">
import {
  BoldIcon,
  ChevronRightIcon,
  HighlighterIcon,
  ItalicIcon,
  SparklesIcon,
  StrikethroughIcon,
} from '@lucide/vue'
import type { Editor } from '@tiptap/core'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { AI_ASK_ACTIONS, type AiAskAction } from '~/lib/aiAsk'

const props = defineProps<{
  editor?: Editor | null
  aiBusy?: boolean
}>()

const emit = defineEmits<{
  ask: [action: string, text: string]
}>()

const visible = ref(false)
const pos = reactive({ top: 0, left: 0 })
const menuEl = ref<HTMLElement | null>(null)
const aiOpen = ref(false)
const active = reactive({ bold: false, italic: false, strike: false, highlight: false })
const selectedText = ref('')

/**
 * An action has been fired but the parent has not re-rendered with `aiBusy`
 * yet.
 *
 * `markRange` dispatches a transaction synchronously inside the same tick as
 * the emit, and the resulting `transaction` event reads `props.aiBusy` before
 * Vue has pushed the new prop down — so relying on the prop alone let the
 * toolbar tear itself down in exactly the case this guard exists to prevent.
 */
const awaitingAi = ref(false)

const working = computed(() => props.aiBusy === true || awaitingAi.value)

watch(() => props.aiBusy, (busy) => {
  if (busy === false) awaitingAi.value = false
})

function selectionRect(): DOMRect | null {
  if (!props.editor) return null

  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null

  const range = selection.getRangeAt(0)

  if (props.editor.view.dom.contains(range.commonAncestorContainer)) {
    return range.getBoundingClientRect()
  }

  return null
}

function position() {
  const rect = selectionRect()
  if (!rect || rect.width === 0) {
    visible.value = false
    return
  }

  const el = menuEl.value
  if (!el) return

  // Measured only after the element has mounted (visible is flipped to true
  // first), so the menu sits cleanly above the selection rather than
  // overlapping its top edge on the very first render.
  const menuHeight = el.offsetHeight
  const menuWidth = el.offsetWidth
  const gap = 8

  let top = rect.top - menuHeight - gap
  if (top < 8) {
    top = rect.bottom + gap
  }

  pos.left = Math.min(Math.max(rect.left, 8), Math.max(window.innerWidth - menuWidth - 8, 8))
  pos.top = top
}

function update() {
  if (!props.editor) {
    visible.value = false
    return
  }

  // A request in flight owns the screen: the suggestion panel is anchored to
  // the same words, and pulling the toolbar out from under it mid-request
  // makes the whole interaction flicker.
  if (working.value) return

  const { selection } = props.editor.state
  const hasTextSelection = !selection.empty
    && selection.$from.parent.isTextblock
    && !selection.$from.node().isAtom

  aiOpen.value = false

  if (!hasTextSelection || !props.editor.isFocused) {
    visible.value = false
    return
  }

  selectedText.value = props.editor.state.doc.textBetween(selection.from, selection.to, ' ')

  active.bold = props.editor.isActive('bold')
  active.italic = props.editor.isActive('italic')
  active.strike = props.editor.isActive('strike')
  active.highlight = props.editor.isActive('highlight')

  visible.value = true
  nextTick(position)
}

function run(action: AiAskAction) {
  if (selectedText.value.trim() === '') return

  // The menu closes but the toolbar stays put until the editor tells it the
  // selection is gone. It used to hide itself here, which is why the "Asking
  // AI…" state it renders was never once seen by anybody.
  aiOpen.value = false
  awaitingAi.value = true
  emit('ask', action.id, selectedText.value)
}

watch(
  () => props.editor,
  (editor) => {
    if (!editor) return
    editor.on('selectionUpdate', update)
    editor.on('transaction', update)
    editor.on('blur', (event) => {
      // A click that lands on a toolbar button can momentarily move focus off
      // the editor. Don't hide the menu for that — the click must still reach
      // the button — only hide for focus that genuinely leaves the editor.
      const related = (event as { relatedTarget?: EventTarget | null } | undefined)?.relatedTarget
      if (related instanceof Node && menuEl.value?.contains(related)) return
      if (working.value) return
      aiOpen.value = false
      visible.value = false
    })
    update()
  },
  { immediate: true },
)

const hasSelection = computed(() => visible.value && selectedText.value.trim() !== '')

/** A short preview of what an action would be applied to. */
const selectionPreview = computed(() => {
  const text = selectedText.value.trim().replace(/\s+/g, ' ')

  return text.length > 46 ? `${text.slice(0, 46)}…` : text
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && aiOpen.value) {
    event.stopPropagation()
    aiOpen.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="menuEl"
      data-dismissable-layer
      class="surface pointer-events-auto fixed z-[110] flex items-center gap-0.5 rounded-xl border p-1 shadow-xl"
      :style="{ top: `${pos.top}px`, left: `${pos.left}px` }"
      @pointerdown.stop
      @mousedown.prevent
      @keydown="onKeydown"
    >
      <Button
        variant="ghost"
        size="icon"
        class="size-7"
        :class="active.bold && 'bg-muted text-foreground'"
        aria-label="Bold"
        @click="editor?.chain().focus().toggleBold().run()"
      >
        <BoldIcon class="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="size-7"
        :class="active.italic && 'bg-muted text-foreground'"
        aria-label="Italic"
        @click="editor?.chain().focus().toggleItalic().run()"
      >
        <ItalicIcon class="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="size-7"
        :class="active.strike && 'bg-muted text-foreground'"
        aria-label="Strikethrough"
        @click="editor?.chain().focus().toggleStrike().run()"
      >
        <StrikethroughIcon class="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="size-7"
        :class="active.highlight && 'bg-muted text-foreground'"
        aria-label="Highlight"
        @click="editor?.chain().focus().toggleHighlight().run()"
      >
        <HighlighterIcon class="size-4" />
      </Button>

      <span class="mx-1 h-5 w-px bg-border" aria-hidden="true" />

      <div class="relative">
        <Button
          variant="ghost"
          size="sm"
          class="h-7 gap-1.5 px-2.5 text-xs text-primary hover:bg-primary/10 hover:text-primary"
          :class="aiOpen && 'bg-primary/10'"
          :disabled="!hasSelection || working"
          :aria-expanded="aiOpen"
          @click="aiOpen = !aiOpen"
        >
          <SparklesIcon class="size-3.5" :class="working && 'animate-pulse'" />
          {{ working ? 'Working…' : 'Ask AI' }}
        </Button>

        <div
          v-if="aiOpen"
          class="surface pointer-events-auto absolute right-0 top-full z-10 mt-1 w-64 overflow-hidden rounded-xl border p-1 shadow-xl"
          @mousedown.prevent
        >
          <!-- Naming the text being acted on is the whole point: these actions
               rewrite legal wording, and a menu that does not say what it is
               about is a menu you have to guess at. -->
          <p class="truncate px-2.5 pb-1.5 pt-1 text-[11px] italic text-muted-foreground">
            “{{ selectionPreview }}”
          </p>
          <button
            v-for="action in AI_ASK_ACTIONS"
            :key="action.id"
            type="button"
            class="group/action flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
            @click="run(action)"
          >
            <span class="min-w-0 flex-1 truncate">{{ action.label }}</span>
            <ChevronRightIcon class="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/action:opacity-100 group-focus-visible/action:opacity-100" />
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>