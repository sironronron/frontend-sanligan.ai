import { Image } from '@tiptap/extension-image'

/**
 * The letter's image node: `@tiptap/extension-image` plus stored width/height
 * so exports (Word/PDF) can size the embedded image without re-decoding it.
 * Images are inserted as data URLs (uploaded) or external URLs.
 */
export const LetterImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: null },
      height: { default: null },
    }
  },
})