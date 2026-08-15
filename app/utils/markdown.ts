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

function transformExportLinks(text: string): string {
  return text.replace(
    /\[Download as (Word|PDF)\]\(\/api\/messages\/([^)]+)\/export\/(word|pdf)\)/g,
    '',
  )
}

function transformInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="rounded bg-muted px-1.5 py-0.5 text-xs">$1</code>')
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
        return `<button type="button" class="saligan-citation" data-cite-kind="${kind}" data-cite-token="${token}" title="Show source [${tokenKind} ${token}]" aria-label="Show source ${token}">${token}</button>`
      }

      const kind = citationKindOf(legacyKind)
      const label = `${legacyKind} ${index}`
      return `<button type="button" class="saligan-citation" data-cite-kind="${kind}" data-cite-index="${index}" title="Show source ${label}" aria-label="Show source ${label}">${index}</button>`
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

function buildTable(rows: string[]): string {
  const cells = rows.map(splitRow)
  const header = cells[0] ?? []
  const aligns = (cells[1] ?? []).map(alignOf)
  const body = cells.slice(2)
  const colCount = Math.max(header.length, ...body.map((r) => r.length), 1)

  const th = Array.from({ length: colCount }, (_, i) => {
    const align = aligns[i] ?? 'left'
    return `<th class="border-b border-border px-3 py-2 align-middle font-medium whitespace-nowrap ${align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'}">${header[i] ?? ''}</th>`
  }).join('')

  const trs = body.map((row) => {
    const tds = Array.from({ length: colCount }, (_, i) => {
      const align = aligns[i] ?? 'left'
      return `<td class="border-b border-border px-3 py-2 align-top whitespace-normal ${align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'}">${row[i] ?? ''}</td>`
    }).join('')
    return `<tr>${tds}</tr>`
  }).join('')

  return `<div class="my-3 overflow-x-auto"><table class="w-full border-collapse text-sm"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`
}

/**
 * Render chat/assistant markdown into safe HTML. Block-aware so GFM tables
 * and `*` bullet lines are rendered as real tables and list bullets.
 *
 * Memoized by input so streaming deltas (which call this on every render) do
 * not re-parse content that has already been rendered.
 */
const markdownCache = new Map<string, string>()

export function renderMarkdown(text: string): string {
  const cached = markdownCache.get(text)
  if (cached !== undefined) return cached

  const rendered = renderMarkdownInternal(text)
  markdownCache.set(text, rendered)
  if (markdownCache.size > 200) {
    markdownCache.clear()
  }

  return rendered
}

function renderMarkdownInternal(text: string): string {
  let html = escapeHtml(text)
  html = fixBrokenPesoSign(html)
  html = stripCodeFencesAndInternalReasoning(html)
  html = removeProtocolMarkers(html)
  html = transformExportLinks(html)
  html = html.replace(/&lt;br\s*\/?&gt;/gi, '<br>')
  html = html.replace(/^### (.+)$/gm, '<h3 class="mt-4 mb-2 text-base font-semibold">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2 class="mt-5 mb-2 text-lg font-bold">$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1 class="mt-6 mb-2 text-xl font-bold">$1</h1>')
  html = transformInline(html)
  html = transformCitations(html)

  const lines = html.split('\n')
  const out: string[] = []
  let paragraph: string[] = []
  let openList: 'ul' | 'ol' | null = null

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
      out.push(buildTable(rows))
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
      out.push('<hr class="my-4 border-border" />')
      continue
    }

    // The model sometimes draws a section rule as a run of dashes framed by
    // "x" characters (e.g. "x-----------------------------------------x").
    // Treat those the same as a markdown "---" rule instead of leaving them
    // as literal text.
    if (/^x\s*[-=–—_*]{3,}\s*x$/i.test(line.trim())) {
      flushParagraph()
      closeList()
      out.push('<hr class="my-4 border-border" />')
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
      out.push(
        `<blockquote class="my-2 rounded-r-md border-l-2 border-primary/60 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">`
          + `<p>${quoteLines.join('</p><p>')}</p></blockquote>`,
      )
      continue
    }

    if (/^[-*] .+/.test(line)) {
      flushParagraph()
      if (openList !== 'ul') {
        closeList()
        out.push('<ul class="my-2 ml-4 list-disc space-y-1">')
        openList = 'ul'
      }
      out.push(`<li>${line.replace(/^[-*] /, '')}</li>`)
      continue
    }

    if (/^\d+[.)]\s+.+/.test(line)) {
      flushParagraph()
      if (openList !== 'ol') {
        closeList()
        out.push('<ol class="my-2 ml-4 list-decimal space-y-1">')
        openList = 'ol'
      }
      out.push(`<li>${line.replace(/^\d+[.)]\s+/, '')}</li>`)
      continue
    }

    if (line.trim() === '') {
      flushParagraph()
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
