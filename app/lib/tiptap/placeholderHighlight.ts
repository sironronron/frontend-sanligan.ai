import { Decoration, Extension } from '@tiptap/core'

/**
 * The slice of a ProseMirror node the walker needs. Declared structurally
 * rather than imported from a prosemirror package so the extension builds
 * without adding a direct dependency on `prosemirror-model`.
 */
interface TextNodeLike {
  isText: boolean
  text: string | null
  childCount: number
  nodeSize: number
  child(index: number): TextNodeLike
}

/**
 * Highlights bracket placeholders the AI still has to fill in — the
 * `[Your Full Name]`-style tokens the letter agent writes for details it
 * could not gather. They are shown tinted in the editor so the user can spot
 * every unfilled field at a glance, then typed over normally.
 *
 * The highlight is a decoration only: it never touches the document JSON, so
 * exporting keeps the literal `[Your Full Name]` token until the user edits
 * it, and saving keeps exactly what the editor holds.
 */
const placeholderPattern = /\[[^\]]+\]/g

export const PlaceholderHighlight = Extension.create({
  name: 'placeholderHighlight',

  addDecorations() {
    return {
      update: 'document',
      create: ({ state }) => {
        const decorations: ReturnType<typeof Decoration.Inline>[] = []
        walkTextNodes(state.doc, 0, decorations)
        return decorations
      },
    }
  },
})

/**
 * Collect inline decorations for every bracket placeholder inside `node`,
 * which starts at document position `start`.
 */
function walkTextNodes(node: TextNodeLike, start: number, decorations: ReturnType<typeof Decoration.Inline>[]): void {
  if (node.isText && node.text) {
    placeholderPattern.lastIndex = 0
    for (const match of node.text.matchAll(placeholderPattern)) {
      const from = start + (match.index ?? 0)
      decorations.push(Decoration.Inline(from, from + match[0].length, { class: 'letter-placeholder' }))
    }
    return
  }

  let pos = start + 1
  for (let i = 0; i < node.childCount; i += 1) {
    const child = node.child(i)
    walkTextNodes(child, pos, decorations)
    pos += child.nodeSize
  }
}