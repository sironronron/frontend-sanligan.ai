/**
 * One shared focus signal across the three citation surfaces — the inline mark
 * in the answer, the card in the sources panel, and the passage in the reader.
 *
 * Hovering (or keyboard-focusing) a citation on any one of them lights the
 * matching element on the others, so "this sentence is sourced by that passage
 * in that document" is one continuous gesture instead of three disconnected
 * things. The signal is a tiny mark — kind + token/index — because that is the
 * only identity the three surfaces have in common.
 *
 * The inline marks live inside v-html the markdown renderer produces, so they
 * are not Vue components and cannot react to the signal directly. A watcher
 * toggles a class on the matching DOM nodes instead, which keeps working
 * through streaming re-renders without re-parsing the markdown.
 */
import { ref, watch } from 'vue'

export interface CitationFocusMark {
  kind: string
  token: string | null
  index: number | null
}

/** The common key a badge and a panel entry resolve to, for matching. */
function focusKey(mark: CitationFocusMark): string {
  const token = (mark.token ?? mark.index ?? '').toString().toUpperCase()
  return `${mark.kind}:${token}`
}

const active = ref<CitationFocusMark | null>(null)

let applied = false

function applyInlineActive() {
  if (!import.meta.client) return
  const key = active.value ? focusKey(active.value) : null

  document
    .querySelectorAll<HTMLElement>('.saligan-citation')
    .forEach((el) => {
      const kind = el.getAttribute('data-cite-kind')
      const token = el.getAttribute('data-cite-token') ?? el.getAttribute('data-cite-index') ?? ''
      const elKey = `${kind}:${token.toUpperCase()}`
      el.classList.toggle('saligan-citation--active', key !== null && elKey === key)
    })
}

export function useCitationFocus() {
  // Register the DOM sync once for the whole app.
  if (!applied) {
    applied = true
    watch(active, () => nextTick(applyInlineActive), { flush: 'post' })
  }

  function focusMark(mark: CitationFocusMark) {
    if (active.value && focusKey(active.value) === focusKey(mark)) return
    active.value = mark
  }

  function clearFocus() {
    active.value = null
  }

  function isActive(mark: CitationFocusMark): boolean {
    if (!active.value) return false
    return focusKey(active.value) === focusKey(mark)
  }

  return { active, focusMark, clearFocus, isActive }
}
