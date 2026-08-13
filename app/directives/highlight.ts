import type { Directive } from 'vue'

const MARK_CLASS = 'saligan-search-mark'
const ACTIVE_CLASS = 'saligan-search-active'

export interface HighlightValue {
  query: string
  active?: number | null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function clearMarks(root: Element) {
  root.querySelectorAll(`mark.${MARK_CLASS}`).forEach((el) => {
    el.replaceWith(document.createTextNode(el.textContent ?? ''))
  })
  root.normalize()
}

function applyHighlight(root: Element, value: string | HighlightValue) {
  clearMarks(root)

  const options = typeof value === 'string' ? { query: value, active: null } : value
  const q = options.query?.trim().toLowerCase() ?? ''
  if (!q) return

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text)
  }

  const regex = new RegExp(escapeRegExp(q), 'gi')
  let markIndex = 0
  for (const node of textNodes) {
    const text = node.textContent ?? ''
    const matches = Array.from(text.matchAll(regex))
    if (matches.length === 0) continue

    const frag = document.createDocumentFragment()
    let last = 0
    for (const match of matches) {
      const index = match.index ?? 0
      if (index > last) {
        frag.appendChild(document.createTextNode(text.slice(last, index)))
      }
      const mark = document.createElement('mark')
      mark.className = MARK_CLASS
      mark.dataset.searchIdx = String(markIndex)
      if (options.active === markIndex) mark.classList.add(ACTIVE_CLASS)
      mark.textContent = text.slice(index, index + match[0].length)
      frag.appendChild(mark)
      markIndex++
      last = index + match[0].length
    }
    if (last < text.length) {
      frag.appendChild(document.createTextNode(text.slice(last)))
    }
    node.parentNode?.replaceChild(frag, node)
  }
}

export const vHighlight: Directive<HTMLElement, string | HighlightValue> = {
  mounted(el, binding) {
    applyHighlight(el, binding.value ?? '')
  },
  updated(el, binding) {
    applyHighlight(el, binding.value ?? '')
  },
}
