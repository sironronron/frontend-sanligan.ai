<script setup lang="ts">
import {
  BoldIcon,
  Heading1Icon,
  Heading2Icon,
  HighlighterIcon,
  ImageIcon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  MaximizeIcon,
  MinimizeIcon,
  PenLineIcon,
  Redo2Icon,
  StrikethroughIcon,
  Undo2Icon,
} from '@lucide/vue'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { aiActionInstruction, aiActionLabel } from '~/lib/aiAsk'
import { AiPending, type AiPendingRange } from '~/lib/tiptap/aiPending'
import { ClickToFocus } from '~/lib/tiptap/clickToFocus'
import { LetterImage } from '~/lib/tiptap/letterImage'
import { PlaceholderHighlight } from '~/lib/tiptap/placeholderHighlight'
import { Signature } from '~/lib/tiptap/signature'
import { SlashCommand } from '~/lib/tiptap/slashCommand'
import { Commentable } from '~/lib/tiptap/commentable'
import LetterCommentLayer from '~/components/editor/LetterCommentLayer.vue'
import type { Component } from 'vue'
import type { TiptapDoc } from '~/types/tiptap'
import ImageInsertDialog from '~/components/editor/ImageInsertDialog.vue'
import LetterAiPanel from '~/components/editor/LetterAiPanel.vue'
import LetterFloatingToolbar from '~/components/editor/LetterFloatingToolbar.vue'

const props = defineProps<{
  content?: TiptapDoc | null
  placeholder?: string
  /** Rendered maximised; the host owns the state so the sheet can widen too. */
  fullscreen?: boolean
  /**
   * The assistant message this letter hangs off.
   *
   * Sent with a rewrite so the server can scope it to the matter — the party
   * names, the dates already established, the register the correspondence
   * uses. Without it the rewriter has no idea which case it is working on,
   * which is why "fix the grammar" used to read like a spellchecker.
   */
  messageId?: string | null
}>()

const emit = defineEmits<{
  update: [doc: TiptapDoc]
  'toggle-fullscreen': []
}>()

const api = useApi()

const editor = useEditor({
  extensions: [
    StarterKit,
    Signature,
    LetterImage,
    SlashCommand,
    Highlight.configure({
      HTMLAttributes: { class: 'letter-highlight' },
    }),
    PlaceholderHighlight,
    AiPending,
    ClickToFocus,
    Commentable,
    Placeholder.configure({
      placeholder: props.placeholder ?? 'Write your letter…',
    }),
  ],
  content: props.content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
  editorProps: {
    attributes: {
      class: 'letter-editor-content',
    },
  },
  onUpdate: ({ editor }) => {
    emit('update', editor.getJSON() as TiptapDoc)

    // A pending suggestion is anchored to positions in the document it was
    // asked about. Once that document changes underneath it those positions
    // can point at different words, and "Replace" would overwrite the wrong
    // clause — the one failure in this feature that actually damages a legal
    // letter. So an edit during the wait abandons the suggestion.
    if (aiRequest.value) abandonAiOnEdit()
  },
})

// Content is pushed in from the outside once (an AI generation, a loaded
// draft), then the user takes over. Compare rather than blindly applying so a
// late parent update never stomps edits that are already on screen.
watch(
  () => props.content,
  (next) => {
    const e = editor.value
    if (!next || !e || e.isDestroyed) return

    const current = e.getJSON() as TiptapDoc
    if (JSON.stringify(current) !== JSON.stringify(next)) {
      e.commands.setContent(next, { emitUpdate: false })
    }
  },
)

function isActive(type: string, attrs?: Record<string, unknown>) {
  const e = editor.value
  if (!e || e.isDestroyed) return false
  return e.isActive(type, attrs)
}

function run(command: (e: NonNullable<typeof editor.value>) => void) {
  const e = editor.value
  if (!e || e.isDestroyed) return
  command(e)
  e.chain().focus().run()
}

function insertSignature() {
  const e = editor.value
  if (!e || e.isDestroyed) return
  e.chain().focus().insertSignature().run()
}

const imageDialogOpen = ref(false)

interface InsertedImageAttrs {
  src: string
  alt?: string
  title?: string
  width?: number | null
  height?: number | null
}

function insertImage(attrs: InsertedImageAttrs) {
  const e = editor.value
  if (!e || e.isDestroyed) return
  e.chain().focus().insertContent({ type: 'image', attrs }).run()
}

/**
 * Roughly how much letter there is. Counted off the plain text rather than the
 * document nodes so a signature block or an image does not inflate it.
 */
const wordCount = computed(() => {
  const e = editor.value
  const text = e && !e.isDestroyed ? e.getText().trim() : ''

  return text === '' ? 0 : text.split(/\s+/).length
})

/** Whether undo/redo are available — guarded so a destroyed editor never throws. */
const canUndo = computed(() => {
  const e = editor.value
  return !!e && !e.isDestroyed && e.can().undo()
})

const canRedo = computed(() => {
  const e = editor.value
  return !!e && !e.isDestroyed && e.can().redo()
})

/* ----------------------------------------------------------------- ask ai --- */

/**
 * Declared before the editor uses it (`onUpdate` runs long after mount) and
 * assigned below, once the state it clears exists.
 */
let abandonAiOnEdit = () => {}

interface AiRequest {
  action: string
  label: string
  /** The exact range the suggestion would replace. */
  from: number
  to: number
  text: string
}

const aiRequest = ref<AiRequest | null>(null)
const aiSuggestion = ref<string | null>(null)
const aiError = ref('')
const aiAnchor = reactive({ top: 0, left: 0 })

const aiBusy = computed(() => aiRequest.value !== null && aiSuggestion.value === null && aiError.value === '')

/** Position the panel just under the range it is about, clamped to the viewport. */
function anchorTo(from: number, to: number) {
  const e = editor.value
  const view = e?.view
  if (!e || e.isDestroyed || !view) return

  const start = view.coordsAtPos(from)
  const end = view.coordsAtPos(to)

  const width = Math.min(416, window.innerWidth - 32)

  aiAnchor.top = Math.min(Math.max(end.bottom, start.bottom) + 8, window.innerHeight - 120)
  aiAnchor.left = Math.min(Math.max(start.left, 16), window.innerWidth - width - 16)
}

/**
 * Draw (or clear) the highlight on the range being worked on.
 *
 * The extension holds the range in its own storage and is asked to rebuild;
 * doing it this way keeps the highlight out of the document JSON and out of
 * the undo stack, so undoing an edit never steps back through a highlight.
 */
function markRange(range: AiPendingRange | null) {
  const e = editor.value
  if (!e || e.isDestroyed) return

  e.storage.aiPending.range = range
  e.commands.updateDecorations('aiPending')
}

/** Clear the highlight and forget the request. */
function clearAi() {
  markRange(null)
  aiRequest.value = null
  aiSuggestion.value = null
  aiError.value = ''
}

abandonAiOnEdit = () => {
  // Applying the suggestion is itself a document change; that path clears the
  // request first, so this only ever fires on an edit the user made.
  clearAi()
}

async function requestRewrite(request: AiRequest) {
  aiSuggestion.value = null
  aiError.value = ''

  // The highlight goes on before the request, and stays on for its whole
  // duration: it is the answer to "which words is it reading?", which the
  // selection cannot give once focus moves to the panel.
  markRange({ from: request.from, to: request.to, state: 'working' })
  anchorTo(request.from, request.to)

  try {
    const response = await api<{ data: { text: string } }>('/text/rewrite', {
      method: 'POST',
      body: {
        text: request.text,
        instruction: aiActionInstruction(request.action),
        message_id: props.messageId ?? null,
      },
    })

    const rewritten = response.data.text.trim()

    // A request the user dismissed while it was in flight must not reopen the
    // panel when it lands.
    if (aiRequest.value !== request) return

    if (rewritten === '') {
      aiError.value = 'The assistant returned nothing to replace it with.'

      return
    }

    aiSuggestion.value = rewritten
    // Restated as a preview: same range, calmer treatment, because nothing is
    // being worked on any more — it is waiting on the reader.
    markRange({ from: request.from, to: request.to, state: 'preview' })
    anchorTo(request.from, request.to)
  } catch (error) {
    if (aiRequest.value !== request) return

    const message = (error as { data?: { message?: string } })?.data?.message

    aiError.value = message ?? 'The rewrite could not be completed. Please try again.'
  }
}

function askAi(action: string, text: string) {
  const view = editor.value
  if (!view || view.isDestroyed || text.trim() === '' || aiBusy.value) return

  const { from, to } = view.state.selection

  aiRequest.value = {
    action,
    label: aiActionLabel(action),
    from,
    to,
    text,
  }

  void requestRewrite(aiRequest.value)
}

function acceptAi() {
  const request = aiRequest.value
  const suggestion = aiSuggestion.value
  const e = editor.value
  if (!request || !suggestion || !e || e.isDestroyed) return

  // Replaces the exact range the suggestion was made about. The old code
  // called insertContent() against whatever the selection happened to be by
  // then, which after a click elsewhere meant pasting the rewrite into an
  // unrelated paragraph.
  markRange(null)

  e.chain()
    .focus()
    .insertContentAt({ from: request.from, to: request.to }, suggestion)
    .run()

  aiRequest.value = null
  aiSuggestion.value = null
  aiError.value = ''
}

function retryAi() {
  const request = aiRequest.value
  if (request) void requestRewrite(request)
}

/** Esc dismisses a pending suggestion before anything else acts on it. */
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && aiRequest.value) {
    event.stopPropagation()
    clearAi()
  }
}

onBeforeUnmount(clearAi)

function getJSON(): TiptapDoc {
  const e = editor.value
  if (!e || e.isDestroyed) {
    return (props.content ?? { type: 'doc', content: [{ type: 'paragraph' }] }) as TiptapDoc
  }
  return e.getJSON() as TiptapDoc
}

defineExpose({ editor, getJSON })

interface ToolbarButton {
  icon: Component
  label: string
  hint: string
  isActive?: () => boolean
  run: (e: NonNullable<typeof editor.value>) => void
}

const groups = computed<ToolbarButton[][]>(() => [
  [
    { icon: BoldIcon, label: 'Bold', hint: '⌘B', isActive: () => isActive('bold'), run: (e) => e.chain().toggleBold().run() },
    { icon: ItalicIcon, label: 'Italic', hint: '⌘I', isActive: () => isActive('italic'), run: (e) => e.chain().toggleItalic().run() },
    { icon: StrikethroughIcon, label: 'Strikethrough', hint: '⌘⇧S', isActive: () => isActive('strike'), run: (e) => e.chain().toggleStrike().run() },
    { icon: HighlighterIcon, label: 'Highlight', hint: '⌘⇧H', isActive: () => isActive('highlight'), run: (e) => e.chain().toggleHighlight().run() },
  ],
  [
    { icon: Heading1Icon, label: 'Heading 1', hint: '⌘⌥1', isActive: () => isActive('heading', { level: 1 }), run: (e) => e.chain().toggleHeading({ level: 1 }).run() },
    { icon: Heading2Icon, label: 'Heading 2', hint: '⌘⌥2', isActive: () => isActive('heading', { level: 2 }), run: (e) => e.chain().toggleHeading({ level: 2 }).run() },
  ],
  [
    { icon: ListIcon, label: 'Bullet list', hint: '⌘⇧8', isActive: () => isActive('bulletList'), run: (e) => e.chain().toggleBulletList().run() },
    { icon: ListOrderedIcon, label: 'Numbered list', hint: '⌘⇧7', isActive: () => isActive('orderedList'), run: (e) => e.chain().toggleOrderedList().run() },
  ],
])
</script>

<template>
  <div class="flex min-h-full flex-col" @keydown="onKeydown">
    <!--
      The toolbar sticks to the top of the scrolling page rather than scrolling
      away with it: on a letter that runs past one screen, formatting controls
      that leave the viewport are controls the reader has to scroll back for.
    -->
    <div
      class="sticky top-0 z-20 flex flex-wrap items-center gap-1 border-b bg-card/85 px-3 py-1.5 backdrop-blur-sm"
    >
      <template v-for="(group, index) in groups" :key="index">
        <span v-if="index > 0" class="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />
        <div class="flex items-center gap-0.5">
          <Button
            v-for="button in group"
            :key="button.label"
            variant="ghost"
            size="icon"
            class="size-7"
            :class="button.isActive?.() && 'bg-muted text-foreground'"
            :aria-label="button.label"
            :aria-pressed="button.isActive?.() ?? false"
            :title="`${button.label} · ${button.hint}`"
            @click="run(button.run)"
          >
            <component :is="button.icon" class="size-4" />
          </Button>
        </div>
      </template>

      <span class="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />

      <Button
        variant="ghost"
        size="sm"
        class="h-7 gap-1.5 px-2.5 text-xs"
        title="Insert a signature block"
        @click="insertSignature"
      >
        <PenLineIcon class="size-3.5" />
        Signature
      </Button>
      <Button
        variant="ghost"
        size="sm"
        class="h-7 gap-1.5 px-2.5 text-xs"
        title="Insert an image"
        @click="imageDialogOpen = true"
      >
        <ImageIcon class="size-3.5" />
        Image
      </Button>

      <div class="ml-auto flex items-center gap-0.5">
        <span class="mr-1 hidden text-[11px] tabular-nums text-muted-foreground sm:inline">
          {{ wordCount }} {{ wordCount === 1 ? 'word' : 'words' }}
        </span>
        <Button
          variant="ghost"
          size="icon"
          class="size-7"
          :disabled="!canUndo"
          aria-label="Undo"
          title="Undo · ⌘Z"
          @click="run((e) => e.chain().undo().run())"
        >
          <Undo2Icon class="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="size-7"
          :disabled="!canRedo"
          aria-label="Redo"
          title="Redo · ⌘⇧Z"
          @click="run((e) => e.chain().redo().run())"
        >
          <Redo2Icon class="size-4" />
        </Button>
        <span class="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />
        <Button
          variant="ghost"
          size="icon"
          class="size-7"
          :aria-label="fullscreen ? 'Exit full screen' : 'Full screen'"
          :aria-pressed="fullscreen"
          :title="fullscreen ? 'Exit full screen' : 'Full screen'"
          @click="emit('toggle-fullscreen')"
        >
          <MinimizeIcon v-if="fullscreen" class="size-4" />
          <MaximizeIcon v-else class="size-4" />
        </Button>
      </div>
    </div>

    <EditorContent :editor="editor" class="letter-editor" :class="fullscreen ? 'letter-editor--full' : ''" />

    <LetterCommentLayer
      v-if="editor"
      :editor="editor"
      :message-id="messageId ?? null"
    />

    <LetterFloatingToolbar
      v-if="editor"
      :editor="editor"
      :ai-busy="aiBusy"
      @ask="askAi"
    />

    <LetterAiPanel
      v-if="aiRequest"
      :top="aiAnchor.top"
      :left="aiAnchor.left"
      :action="aiRequest.label"
      :suggestion="aiSuggestion"
      :error="aiError"
      @accept="acceptAi"
      @discard="clearAi"
      @retry="retryAi"
    />

    <ImageInsertDialog
      v-if="imageDialogOpen"
      @close="imageDialogOpen = false"
      @insert="insertImage"
    />
  </div>
</template>
