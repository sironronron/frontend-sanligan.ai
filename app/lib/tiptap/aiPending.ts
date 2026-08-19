import { Decoration, Extension } from '@tiptap/core'

/**
 * Marks the span of text the assistant is currently working on.
 *
 * "Ask AI" used to give no sign that anything was happening. The floating
 * toolbar hid itself the instant an action was picked — taking its own
 * "Asking AI…" label with it — the selection was dropped on the next click,
 * and some seconds later the text simply changed. On a legal letter that reads
 * as the document mutating on its own.
 *
 * A decoration is the right mechanism rather than the selection: it is drawn
 * from the document, so it survives the editor losing focus to the suggestion
 * panel, and it answers the question the selection no longer can — *which
 * words did I just ask about?*
 *
 * Nothing here touches the document JSON, so an export or a save while a
 * suggestion is pending carries exactly the text on screen.
 */
export interface AiPendingRange {
  from: number
  to: number
  /** `working` shimmers; `preview` marks what "Replace" would overwrite. */
  state: 'working' | 'preview'
}

export interface AiPendingStorage {
  range: AiPendingRange | null
}

// Registers this extension's storage on the editor's `Storage` map, so
// `editor.storage.aiPending` is typed rather than an unchecked index.
declare module '@tiptap/core' {
  interface Storage {
    aiPending: AiPendingStorage
  }
}

export const AiPending = Extension.create<Record<string, never>, AiPendingStorage>({
  name: 'aiPending',

  addStorage() {
    return { range: null }
  },

  addDecorations() {
    return {
      // Recomputed only when the range is set or cleared, never on every
      // keystroke: it is driven by a request in flight, not by the document.
      update: 'manual',
      create: ({ editor }) => {
        const range = editor.storage.aiPending?.range

        if (!range) return []

        const size = editor.state.doc.content.size
        const from = Math.max(0, Math.min(range.from, size))
        const to = Math.max(from, Math.min(range.to, size))

        if (from === to) return []

        return [
          Decoration.Inline(from, to, {
            class: range.state === 'working' ? 'letter-ai-working' : 'letter-ai-preview',
          }),
        ]
      },
    }
  },
})
