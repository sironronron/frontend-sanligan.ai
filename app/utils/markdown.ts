function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function removeProtocolMarkers(text: string): string {
  return text
    .replace(/^\s*\[\[DOCUMENT_START\]\]\s*$/gm, '')
    .replace(/^\s*\[\[DOCUMENT_END\]\]\s*$/gm, '')
    .replace(/^\s*\[\[TODO_START\]\]\s*$/gm, '')
    .replace(/^\s*\[\[TODO_END\]\]\s*$/gm, '')
    .replace(/^\s*Next Steps Checklist Created Below Using create_todo Tool:\s*$/gim, '')
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
 * Turn inline `[Source N]` / `[User Doc N]` / `[Web N]` markers into clickable
 * badges. The badges carry `data-cite-kind` / `data-cite-index` so the parent
 * page can highlight and scroll the matching card in the citation sidebar.
 * The button is inline-styled because v-html output is not covered by scoped
 * component styles.
 */
function transformCitations(text: string): string {
  return text.replace(
    /\[(Source|User\s+Doc|Web)\s+(\d+)\]/g,
    (_match, word: string, index: string) => {
      const kind = citationKindOf(word)
      const label = `${word} ${index}`
      const style = [
        'display:inline-flex',
        'align-items:center',
        'justify-content:center',
        'min-width:1.15em',
        'height:1.15em',
        'padding:0 .3em',
        'font-size:.68em',
        'font-weight:700',
        'line-height:1',
        'border-radius:9999px',
        'vertical-align:super',
        'margin:0 .12em',
        'cursor:pointer',
        'color:var(--primary)',
        'background:color-mix(in oklab,var(--primary) 12%,transparent)',
        'border:1px solid color-mix(in oklab,var(--primary) 35%,transparent)',
      ].join(';')
      return `<button type="button" data-cite-kind="${kind}" data-cite-index="${index}" title="${label}" style="${style}">${index}</button>`
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

  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${paragraph.join('<br>')}</p>`)
      paragraph = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line === undefined) continue

    if (line.trim().startsWith('|') && isTableDelimiter(lines[i + 1])) {
      flushParagraph()
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
      out.push(line)
      continue
    }

    if (/^x-{4,}x$/.test(line.trim())) {
      flushParagraph()
      out.push('<hr class="my-4 border-border" />')
      continue
    }

    if (/^&gt;\s?/.test(line)) {
      flushParagraph()
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
      out.push(`<li class="ml-4 list-disc">${line.replace(/^[-*] /, '')}</li>`)
      continue
    }

    if (/^\d+\. .+/.test(line)) {
      flushParagraph()
      out.push(`<li class="ml-4 list-decimal">${line.replace(/^\d+\. /, '')}</li>`)
      continue
    }

    if (line.trim() === '') {
      flushParagraph()
      continue
    }

    paragraph.push(line)
  }

  flushParagraph()

  return out.join('\n')
}
