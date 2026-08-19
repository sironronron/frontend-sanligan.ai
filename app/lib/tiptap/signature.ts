import { mergeAttributes, Node } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import SignatureNodeView from '~/components/SignatureNodeView.vue'

/**
 * A block-level placeholder that holds a drawn or typed signature. Unsigned,
 * it renders as an "Add signature" slot in the node view; once signed, the
 * image data URL and the signer's details live on the node's attributes so
 * they are saved and exported with the document JSON.
 */
export const Signature = Node.create({
  name: 'signature',

  group: 'block',

  atom: true,

  // Draggable so the signature block can be dragged to wherever it belongs —
  // the bottom of the letter is the default, but the sender may want it
  // before a closing or on its own line. The grip moves it *between* blocks;
  // horizontal placement on its own line is `offsetX` (see below), because a
  // block node can only ever be dropped at a block boundary.
  selectable: true,

  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      signedAt: { default: null },
      signerName: { default: null },
      width: { default: null },
      height: { default: null },
      // Where the signature sits across its line, as a percentage of the
      // line's width for the block's left edge. Null means "wherever `align`
      // puts it" — the moment the user drags it sideways this takes over, so
      // the signature can be nudged onto the exact spot the letter leaves for
      // it instead of being stuck at one of three alignments.
      offsetX: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-offset-x')
          if (raw === null) return null
          const value = Number.parseFloat(raw)
          return Number.isFinite(value) ? value : null
        },
        renderHTML: attributes =>
          attributes.offsetX === null || attributes.offsetX === undefined
            ? {}
            : {
                'data-offset-x': String(attributes.offsetX),
                style: `margin-left:${attributes.offsetX}%`,
              },
      },
      align: {
        default: 'right',
        parseHTML: element => element.getAttribute('data-align') ?? 'right',
        renderHTML: attributes =>
          attributes.align && attributes.align !== 'right'
            ? { 'data-align': attributes.align }
            : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-signature]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-signature': '' })]
  },

  addCommands() {
    return {
      insertSignature:
        () =>
          ({ state, chain }) => {
            const { $from } = state.selection

            // A signature dropped at the cursor lands wherever the cursor is —
            // and inside a list item or a blockquote that means a signature
            // nested in a bullet, which is never what the sender meant and
            // which Word and PDF have no way to represent. So from anywhere
            // below the top level it goes after the enclosing block instead.
            const at = $from.depth > 1 ? $from.after(1) : null

            // Focus is left to the caller, which already chains it.
            return at === null
              ? chain().insertContent({ type: 'signature' }).run()
              : chain().insertContentAt(at, { type: 'signature' }).run()
          },
    }
  },

  addNodeView() {
    return VueNodeViewRenderer(SignatureNodeView)
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    signature: {
      /** Insert an empty signature slot as a block of its own. */
      insertSignature: () => ReturnType
    }
  }
}