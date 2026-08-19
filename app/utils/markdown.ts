function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Fix broken peso sign encoding. The model sometimes outputs "?" instead of
 * the peso sign (₱) due to tokenizer limitations. This replaces common
 * broken patterns with the correct character.
 */
function fixBrokenPesoSign(text: string): string {
  return text
    .replace(/\?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g, '₱$1')
    .replace(/PHP\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g, '₱$1')
}

function removeProtocolMarkers(text: string): string {
  return text
    .replace(/^\s*\[\[DOCUMENT_START\]\]\s*$/gm, '')
    .replace(/^\s*\[\[DOCUMENT_END\]\]\s*$/gm, '')
    // The model sometimes bolds the TODO markers ("**[TODO_START]**"), drops to
    // single brackets, or leads them with a list dash, so they are matched
    // tolerantly — an unstripped marker renders as visible text in the reply.
    .replace(/^[ \t*_\-–—~]*\[{1,2}TODO_(?:START|END)\]{1,2}[ \t*_\-–—~]*$/gim, '')
    .replace(/^\s*Next Steps Checklist Created Below Using create_todo Tool:\s*$/gim, '')
    // Memory write-back markers are bookkeeping between the model and the
    // server's MemoryWriteBackParser, never user-facing content. Strip them
    // here too so they never flash during streaming (the server only removes
    // them when the reply is persisted, after the stream reaches the client).
    .replace(/\[\[MEMORY_WRITE_START\]\][\s\S]*?\[\[MEMORY_WRITE_END\]\]/g, '')
    // While a write-back block is still streaming in it has no closing marker
    // yet; hide the raw start marker rather than let it flash on screen.
    .replace(/\[\[MEMORY_WRITE_START\]\][\s\S]*$/g, '')
    // The fact-gathering block is a protocol between the model and the server,
    // which turns its questions into the intake form. The server withholds it
    // from the stream, so this only catches replies persisted before that
    // landed — but a visible "[[NEED_INFO]]" followed by questions the user
    // cannot answer in chat is the worst thing to leave on screen.
    .replace(/\[\[NEED_INFO\]\][\s\S]*?\[\[(?:\/\s*NEED_INFO|NEED_INFO_END)\]\]/g, '')
    .replace(/\[\[NEED_INFO\]\][\s\S]*$/g, '')
}

/**
 * Strip code-fence wrappers the model sometimes wraps entire responses in
 * (e.g. ```python ... ```) as well as internal reasoning the model leaks
 * into the visible output.
 */
function stripCodeFencesAndInternalReasoning(text: string): string {
  let cleaned = text

  // Strip ```python ... ``` or ``` ... ``` wrappers around the entire response
  cleaned = cleaned.replace(/^```(?:python|json|text|plaintext)?\s*\n/i, '')
  cleaned = cleaned.replace(/\n```\s*$/i, '')

  // Strip background/internal reasoning lines the model sometimes leaks
  cleaned = cleaned.replace(/^No tool calls required.*$/gim, '')
  cleaned = cleaned.replace(/^Note:\s*Since.*$/gim, '')
  cleaned = cleaned.replace(/^I have utilized.*$/gim, '')
  cleaned = cleaned.replace(/^Note:.*$/gim, '')

  return cleaned.trim()
}

function transformInline(text: string, bare: boolean): string {
  const code = bare ? '<code>$1</code>' : '<code class="rounded bg-muted px-1.5 py-0.5 text-xs">$1</code>'

  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, code)
}

type CitationKind = 'legal' | 'document' | 'web'

function citationKindOf(word: string): CitationKind {
  if (word === 'Source') return 'legal'
  if (word === 'Web') return 'web'
  return 'document'
}

/**
 * Turn inline `[SRC <token>]` / `[DOC <token>]` / `[Source N]` / `[User Doc N]`
 * / `[Web N]` markers into small citation badges.
 *
 * Each badge keeps the marker's source id (`data-cite-kind` /
 * `data-cite-token` / `data-cite-index`), which is what the page's click
 * handler resolves back to a source card. It is a real `<button>`, not a
 * `<span>`: pressing one opens the sources panel on that citation, and that
 * has to be reachable by keyboard and announced as an action rather than as a
 * stray number in the middle of a sentence.
 */
function transformCitations(text: string): string {
  return text.replace(
    /\[(SRC|DOC)\s+([A-Z0-9]+)\]|\[(Source|User\s+Doc|Web)\s+(\d+)\]/gi,
    (_match, tokenKind: string, token: string, legacyKind: string, index: string) => {
      if (tokenKind !== undefined) {
        const kind = tokenKind === 'SRC' ? 'legal' : 'document'
        return `<button type="button" class="saligan-citation cite-mark" data-cite-kind="${kind}" data-cite-token="${token}" title="Show source [${tokenKind} ${token}]" aria-label="Show source ${token}">${token}</button>`
      }

      const kind = citationKindOf(legacyKind)
      const label = `${legacyKind} ${index}`
      return `<button type="button" class="saligan-citation cite-mark" data-cite-kind="${kind}" data-cite-index="${index}" title="Show source ${label}" aria-label="Show source ${label}">${index}</button>`
    },
  )
}

function splitRow(line: string): string[] {
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return body.split('|').map((cell) => cell.trim())
}

function isTableDelimiter(line: string | undefined): boolean {
  if (!line || !line.includes('-')) return false
  const stripped = line.replace(/\s/g, '')
  return /^\|[:|\-]+\|$/.test(stripped)
}

function alignOf(cell: string): 'left' | 'center' | 'right' {
  const c = cell.replace(/[\s\-]+/g, '')
  if (c === ':') return 'left'
  if (c.startsWith(':') && c.endsWith(':')) return 'center'
  if (c.endsWith(':')) return 'right'
  return 'left'
}

function buildTable(rows: string[], bare: boolean): string {
  const cells = rows.map(splitRow)
  const header = cells[0] ?? []
  const aligns = (cells[1] ?? []).map(alignOf)
  const body = cells.slice(2)
  const colCount = Math.max(header.length, ...body.map((r) => r.length), 1)

  // Alignment is the table's own meaning, not decoration, so it survives in
  // both modes; only the spacing and border utilities are dropped when the
  // caller styles the block itself.
  const cell = (tag: 'th' | 'td', index: number, content: string): string => {
    const align = aligns[index] ?? 'left'
    const alignClass = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'
    const base = tag === 'th'
      ? 'border-b border-border px-3 py-2 align-middle font-medium whitespace-nowrap'
      : 'border-b border-border px-3 py-2 align-top whitespace-normal'

    return `<${tag} class="${bare ? alignClass : `${base} ${alignClass}`}">${content}</${tag}>`
  }

  const th = Array.from({ length: colCount }, (_, i) => cell('th', i, header[i] ?? '')).join('')

  const trs = body.map((row) => {
    const tds = Array.from({ length: colCount }, (_, i) => cell('td', i, row[i] ?? '')).join('')
    return `<tr>${tds}</tr>`
  }).join('')

  const wrapper = bare ? 'overflow-x-auto' : 'my-3 overflow-x-auto'
  const table = bare ? '' : ' class="w-full border-collapse text-sm"'

  return `<div class="${wrapper}"><table${table}><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`
}

export interface RenderMarkdownOptions {
  /**
   * Emit structural HTML without the presentational utility classes, for a
   * caller that styles the whole block itself.
   *
   * The chat answer is set as prose by one stylesheet rule (`.batayan-prose`)
   * so its rhythm is decided in a single place. Utility classes baked into the
   * markup fight that — Tailwind's `space-y-*` in particular outranks any
   * sensible element selector — and the answer ends up with spacing that comes
   * from two places at once. Every other caller (the terms pages, the document
   * viewer, the citation reader) has no stylesheet of its own and still wants
   * the classes, so this is opt-in.
   */
  bare?: boolean
}

/**
 * Render chat/assistant markdown into safe HTML. Block-aware so GFM tables
 * and `*` bullet lines are rendered as real tables and list bullets.
 *
 * Memoized by input so streaming deltas (which call this on every render) do
 * not re-parse content that has already been rendered.
 */
const markdownCache = new Map<string, string>()

export function renderMarkdown(text: string, options: RenderMarkdownOptions = {}): string {
  const bare = options.bare === true
  // The two modes produce different HTML for the same source, so the mode is
  // part of the key — otherwise a page rendering both would serve one the
  // other's markup.
  const key = bare ? `bare:${text}` : text

  const cached = markdownCache.get(key)
  if (cached !== undefined) return cached

  const rendered = renderMarkdownInternal(text, bare)
  markdownCache.set(key, rendered)
  if (markdownCache.size > 200) {
    markdownCache.clear()
  }

  return rendered
}

function renderMarkdownInternal(text: string, bare: boolean): string {
  let html = escapeHtml(text)
  html = fixBrokenPesoSign(html)
  html = stripCodeFencesAndInternalReasoning(html)
  html = removeProtocolMarkers(html)
  html = html.replace(/&lt;br\s*\/?&gt;/gi, '<br>')
  html = html.replace(/^### (.+)$/gm, bare ? '<h3>$1</h3>' : '<h3 class="mt-4 mb-2 text-base font-semibold">$1</h3>')
  html = html.replace(/^## (.+)$/gm, bare ? '<h2>$1</h2>' : '<h2 class="mt-5 mb-2 text-lg font-bold">$1</h2>')
  html = html.replace(/^# (.+)$/gm, bare ? '<h1>$1</h1>' : '<h1 class="mt-6 mb-2 text-xl font-bold">$1</h1>')
  html = transformInline(html, bare)
  html = transformCitations(html)

  const lines = html.split('\n')
  const out: string[] = []
  let paragraph: string[] = []
  let openList: 'ul' | 'ol' | null = null

  const UNORDERED_ITEM = /^[-*] .+/
  const ORDERED_ITEM = /^(\d+)[.)]\s+.+/

  const listKindOf = (line: string): 'ul' | 'ol' | null => {
    if (UNORDERED_ITEM.test(line)) return 'ul'
    if (ORDERED_ITEM.test(line)) return 'ol'
    return null
  }

  /**
   * The kind of list item that resumes after a run of blank lines, or null if
   * the list really has ended. Models differ on whether they separate list
   * items with a blank line — Claude usually does, local models usually do
   * not — and closing the list on the blank line restarted the numbering at 1
   * on every item.
   */
  const listKindAfterBlankLines = (from: number): 'ul' | 'ol' | null => {
    for (let j = from; j < lines.length; j++) {
      const next = lines[j]
      if (next === undefined) return null
      if (next.trim() === '') continue
      return listKindOf(next)
    }
    return null
  }

  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${paragraph.join('<br>')}</p>`)
      paragraph = []
    }
  }

  const closeList = () => {
    if (openList !== null) {
      out.push(`</${openList}>`)
      openList = null
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line === undefined) continue

    if (line.trim().startsWith('|') && isTableDelimiter(lines[i + 1])) {
      flushParagraph()
      closeList()
      const rows: string[] = [line.trim()]
      i++
      while (i < lines.length) {
        const next = lines[i]
        if (next === undefined || !next.trim().startsWith('|')) break
        rows.push(next.trim())
        i++
      }
      out.push(buildTable(rows, bare))
      continue
    }

    if (/^<h[123] /.test(line)) {
      flushParagraph()
      closeList()
      out.push(line)
      continue
    }

    if (/^[-*]{1,3}$/.test(line.trim())) {
      flushParagraph()
      closeList()
      out.push(bare ? '<hr>' : '<hr class="my-4 border-border" />')
      continue
    }

    // The model sometimes draws a section rule as a run of dashes framed by
    // "x" characters (e.g. "x-----------------------------------------x").
    // Treat those the same as a markdown "---" rule instead of leaving them
    // as literal text.
    if (/^x\s*[-=–—_*]{3,}\s*x$/i.test(line.trim())) {
      flushParagraph()
      closeList()
      out.push(bare ? '<hr>' : '<hr class="my-4 border-border" />')
      continue
    }

    if (/^&gt;\s?/.test(line)) {
      flushParagraph()
      closeList()
      const quoteLines: string[] = []
      while (i < lines.length) {
        const next = lines[i]
        if (next === undefined || !/^&gt;\s?/.test(next)) break
        quoteLines.push(next.replace(/^&gt;\s?/, ''))
        i++
      }
      const quoteClass = bare
        ? ''
        : ' class="my-2 rounded-r-md border-l-2 border-primary/60 bg-muted/40 px-3 py-2 text-sm text-muted-foreground"'

      out.push(`<blockquote${quoteClass}><p>${quoteLines.join('</p><p>')}</p></blockquote>`)
      continue
    }

    if (UNORDERED_ITEM.test(line)) {
      flushParagraph()
      if (openList !== 'ul') {
        closeList()
        out.push(bare ? '<ul class="list-disc">' : '<ul class="my-2 ml-4 list-disc space-y-1">')
        openList = 'ul'
      }
      out.push(`<li>${line.replace(/^[-*] /, '')}</li>`)
      continue
    }

    const ordered = ORDERED_ITEM.exec(line)
    if (ordered) {
      flushParagraph()
      if (openList !== 'ol') {
        closeList()
        // A list that does not start at 1 keeps its own numbering — a reply
        // that continues "4." after an interrupting paragraph should not
        // restart the count.
        const start = Number(ordered[1])
        const startAttr = Number.isFinite(start) && start !== 1 ? ` start="${start}"` : ''
        out.push(
          bare
            ? `<ol class="list-decimal"${startAttr}>`
            : `<ol class="my-2 ml-4 list-decimal space-y-1"${startAttr}>`,
        )
        openList = 'ol'
      }
      out.push(`<li>${line.replace(/^\d+[.)]\s+/, '')}</li>`)
      continue
    }

    if (line.trim() === '') {
      flushParagraph()
      // Blank lines inside a list are spacing between items, not the end of
      // the list; only close it if what follows is not another item of the
      // same kind.
      if (openList !== null && listKindAfterBlankLines(i + 1) === openList) {
        continue
      }
      closeList()
      continue
    }

    // Plain text resumes after any open list; join consecutive lines into a
    // single paragraph with <br> as the original renderer did.
    closeList()
    paragraph.push(line)
  }

  flushParagraph()
  closeList()

  return out.join('\n')
}
