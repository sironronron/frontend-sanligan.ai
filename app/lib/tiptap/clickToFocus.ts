import { Extension } from '@tiptap/core'

/**
 * Makes the whole editor container feel clickable. ProseMirror only positions
 * the cursor for clicks that land on the editable content, so a click on the
 * sheet's empty padding — the gutter around the page, or the whitespace below
 * the last line — used to do nothing. This focuses the editor on those
 * clicks (dropping the cursor at the end), while interactive descendants
 * (toolbar buttons, links, the signature node view) keep their own behavior.
 */
export const ClickToFocus = Extension.create({
  name: 'clickToFocus',

  addOptions() {
    return {
      interactive: 'button, a, input, select, textarea, [contenteditable="false"], [data-signature]',
    }
  },

  onCreate() {
    // The editable's parent is the EditorContent wrapper, which carries the
    // container padding that ProseMirror never sees.
    const container = this.editor.view.dom.closest('.letter-editor') ?? this.editor.view.dom
    container.addEventListener('click', this.onClick)
    this.container = container
  },

  onDestroy() {
    this.container?.removeEventListener('click', this.onClick)
  },

  onClick(event: MouseEvent) {
    const editor = this.editor
    const target = event.target as HTMLElement | null
    if (!target) return
    if (target.closest(this.options.interactive)) return
    // Clicks inside the content are handled by ProseMirror itself (it focuses
    // on mousedown and positions the cursor), so by the time this fires the
    // editor is already focused for those. Only a click the editable never
    // saw — the padding around the page — still needs the nudge.
    if (editor.isFocused) return
    editor.commands.focus('end')
  },
})
