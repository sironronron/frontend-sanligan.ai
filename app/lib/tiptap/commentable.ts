import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type PluginView } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'

/**
 * Stamps every block-level node (paragraph, heading, list, list item, quote,
 * signature) with a stable `blockId`, rendered to the DOM as `data-block-id`
 * so the comment layer can anchor a thread to a specific line of the letter.
 *
 * The id is assigned lazily: an `appendTransaction` plugin fills any block
 * missing one the moment the document changes (including the first load), so
 * comments survive edits and stay pinned to the section they were made on.
 */
const BLOCK_TYPES = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'signature',
]

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return 'block-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export const Commentable = Extension.create({
  name: 'commentable',

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES,
        attributes: {
          blockId: {
            default: null,
            parseHTML: element => element.getAttribute('data-block-id'),
            renderHTML: attributes =>
              attributes.blockId
                ? { 'data-block-id': attributes.blockId }
                : {},
          },
        },
      },
    ]
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('commentableIds'),
        appendTransaction(transactions, _oldState, newState) {
          // Stamp ids on edits (docChanged) and on the one-shot init nudge
          // below, so a freshly loaded draft is anchorable immediately rather
          // than only after the user first edits it.
          const docChanged = transactions.some(transaction => transaction.docChanged)
          const isInit = transactions.some(transaction => transaction.getMeta('commentableInit'))
          if (!docChanged && !isInit) return null

          const tr = newState.tr
          let touched = false

          newState.doc.descendants((node, pos) => {
            if (!BLOCK_TYPES.includes(node.type.name)) return
            if (node.attrs.blockId) return

            tr.setNodeAttribute(pos, 'blockId', uuid())
            touched = true
          })

          return touched ? tr : null
        },
        view(view: EditorView) {
          // Initial content is set without a transaction, so the first
          // appendTransaction never runs on load. Nudge one through once the
          // view exists so every block gets an id right away. `init` is a
          // runtime PluginView hook not present in these typings, hence the cast.
          return {
            init: () => {
              setTimeout(() => {
                const { state, dispatch } = view
                let missing = false
                state.doc.descendants((node: ProseMirrorNode) => {
                  if (BLOCK_TYPES.includes(node.type.name) && !node.attrs.blockId) missing = true
                })
                if (missing) {
                  dispatch(state.tr.setMeta('addToHistory', false).setMeta('commentableInit', true))
                }
              }, 0)
            },
          } as PluginView
        },
      }),
    ]
  },
})
