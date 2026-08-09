import type { Directive } from 'vue'

const MARK_CLASS = 'saligan-search-mark'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function clearMarks(root: Element) {
  root.querySelectorAll(`mark.${MARK_CLASS}`).forEach((el) => {
    el.replaceWith(document.createTextNode(el.textContent ?? ''))
  })
  root.normalize()
}

function applyHighlight(root: Element, query: string) {
  clearMarks(root)

  const q = query.trim().toLowerCase()
  if (!q) return

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text)
  }

  for (const node of textNodes) {
    const text = node.textContent ?? ''
    const regex = new RegExp(escapeRegExp(q), 'gi')
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
      mark.textContent = text.slice(index, index + match[0].length)
      frag.appendChild(mark)
      last = index + match[0].length
    }
    if (last < text.length) {
      frag.appendChild(document.createTextNode(text.slice(last)))
    }
    node.parentNode?.replaceChild(frag, node)
  }
}

export const vHighlight: Directive<HTMLElement, string> = {
  mounted(el, binding) {
    applyHighlight(el, binding.value ?? '')
  },
  updated(el, binding) {
    applyHighlight(el, binding.value ?? '')
  },
}
