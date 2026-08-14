import type { ChatMessage, ChatSource } from '~/types/chat'
import type { CitationEntry } from '~/types/citations'

/**
 * What identifies the underlying source, so the same statute cited by four
 * answers in a row collapses into one card. Falls back to the citation's own
 * id when nothing sturdier is present — better a duplicate card than two
 * unrelated sources merged into one.
 */
export function identityOf(source: ChatSource): string | null {
  if (source.type === 'web') return source.url ? `web:${source.url}` : null
  if (source.type === 'document') {
    return source.document_id ? `document:${source.document_id}` : (source.id ? `document-chunk:${source.id}` : null)
  }
  return source.page_id
    ? `legal:${source.page_id}`
    : (source.url ? `legal-url:${source.url}` : (source.id ? `legal-chunk:${source.id}` : null))
}

function labelOf(source: ChatSource): string {
  if (source.type === 'web') {
    return source.title || source.label || source.domain || source.url || 'Web result'
  }
  return source.label || source.title || (source.type === 'document' ? 'Uploaded document' : 'Legal source')
}

/** Where a citation can be read in-app, if it can be at all. */
function readableIdOf(source: ChatSource): string | null {
  if (source.type === 'document') return source.document_id ?? null
  if (source.type === 'legal') return source.page_id ?? null
  return null
}

function entryFrom(source: ChatSource, key: string, index: number): CitationEntry {
  return {
    key,
    type: source.type,
    index,
    token: source.token ?? null,
    label: labelOf(source),
    title: source.title ?? null,
    excerpts: source.excerpt ? [source.excerpt] : [],
    citedChunkIndexes: [...(source.cited_chunk_indexes ?? (source.chunk_index !== undefined ? [source.chunk_index] : []))],
    readableId: readableIdOf(source),
    hasDigest: source.has_digest ?? false,
    url: source.url ?? null,
    domain: source.domain ?? null,
    mimeType: source.mime_type ?? null,
    uploadedAt: source.uploaded_at ?? null,
    tags: source.tags ?? [],
    sourceName: source.source_name ?? null,
    lawName: source.law_name ?? null,
    grNumber: source.gr_number ?? null,
    promulgationDate: source.promulgation_date ?? null,
  }
}

/**
 * Every source the thread's answers were grounded in, one card per underlying
 * document, authority, or page on the web.
 *
 * Ordering follows first appearance in the conversation so the panel reads in
 * the order the answers introduced the sources, and web results sink below the
 * legal and document citations — the panel shows them in their own section.
 */
export function collectCitations(messages: ChatMessage[]): CitationEntry[] {
  const byIdentity = new Map<string, CitationEntry>()
  let counter = 0

  for (const message of messages) {
    if (message.role !== 'assistant') continue

    for (const source of message.sources ?? []) {
      const identity = identityOf(source)
      if (identity === null) continue

      const existing = byIdentity.get(identity)

      if (existing === undefined) {
        counter++
        byIdentity.set(identity, entryFrom(source, identity, source.index ?? counter))
        continue
      }

      // The same source cited again, usually through a different passage.
      if (source.excerpt && !existing.excerpts.includes(source.excerpt)) {
        existing.excerpts.push(source.excerpt)
      }

      for (const chunkIndex of source.cited_chunk_indexes ?? []) {
        if (!existing.citedChunkIndexes.includes(chunkIndex)) existing.citedChunkIndexes.push(chunkIndex)
      }

      // Later citations may carry detail the first one lacked — a digest that
      // has since been generated, categories added after the upload.
      existing.hasDigest ||= source.has_digest ?? false
      existing.readableId ??= readableIdOf(source)
      if (existing.tags.length === 0 && source.tags?.length) existing.tags = source.tags
      existing.uploadedAt ??= source.uploaded_at ?? null
      existing.mimeType ??= source.mime_type ?? null
    }
  }

  const entries = [...byIdentity.values()]

  for (const entry of entries) entry.citedChunkIndexes.sort((a, b) => a - b)

  return entries.sort((a, b) => Number(a.type === 'web') - Number(b.type === 'web'))
}

/** What an inline citation badge in the answer text carries about itself. */
export interface CitationMark {
  kind: ChatSource['type']
  token: string | null
  index: number | null
}

/**
 * Read a clicked inline citation badge, if that is what was clicked.
 *
 * The badge is the only thing in the rendered answer carrying `data-cite-kind`,
 * and `closest` is used so a click landing on the number's text node still
 * resolves to the badge itself.
 */
export function citationMarkFrom(target: EventTarget | null): CitationMark | null {
  const badge = (target as HTMLElement | null)?.closest?.('[data-cite-kind]')

  if (!badge) return null

  const kind = badge.getAttribute('data-cite-kind')

  if (kind !== 'legal' && kind !== 'document' && kind !== 'web') return null

  const index = badge.getAttribute('data-cite-index')

  return {
    kind,
    token: badge.getAttribute('data-cite-token'),
    index: index === null ? null : Number(index),
  }
}

/**
 * The source card an inline badge refers to.
 *
 * Resolved against the message the badge was clicked in first, since that is
 * where the marker was written and where its token or position is unambiguous.
 * Tokens are derived from the source's own id, so they hold across the thread —
 * that is the fallback when the message's own sources no longer list it, which
 * happens when a chunk has since been deleted from under an older answer.
 */
export function findCitation(
  entries: CitationEntry[],
  message: ChatMessage | null,
  mark: CitationMark,
): CitationEntry | null {
  const token = mark.token?.toUpperCase() ?? null

  const inMessage = (message?.sources ?? []).find((source) => {
    if (source.type !== mark.kind) return false
    if (token !== null) return (source.token ?? '').toUpperCase() === token
    return source.index === mark.index
  })

  if (inMessage) {
    const identity = identityOf(inMessage)
    const matched = entries.find((entry) => entry.key === identity)
    if (matched) return matched
  }

  if (token !== null) {
    return entries.find((entry) => entry.type === mark.kind && entry.token?.toUpperCase() === token) ?? null
  }

  return entries.find((entry) => entry.type === mark.kind && entry.index === mark.index) ?? null
}

/**
 * The site's own icon, which is how people recognise a source at a glance —
 * far faster than reading the domain. Served by Google's favicon endpoint
 * because fetching `/favicon.ico` cross-origin is blocked for most sites; the
 * card falls back to a globe glyph when the image fails to load.
 */
export function faviconUrl(domain: string | null): string | null {
  if (!domain) return null
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`
}

const TYPE_LABELS: Record<string, string> = {
  pdf: 'PDF',
  doc: 'Word document',
  docx: 'Word document',
  odt: 'Text document',
  rtf: 'Rich text',
  txt: 'Plain text',
  md: 'Markdown',
  markdown: 'Markdown',
  jpg: 'Image',
  jpeg: 'Image',
  png: 'Image',
  webp: 'Image',
  gif: 'Image',
  tiff: 'Image',
  tif: 'Image',
  heic: 'Image',
  heif: 'Image',
  bmp: 'Image',
}

/**
 * What kind of file an uploaded citation came from, in words a lawyer would
 * use rather than a MIME string. The extension is preferred over `mime_type`
 * because the latter is whatever the uploading browser claimed.
 */
export function documentTypeLabel(filename: string | null, mimeType: string | null): string {
  const extension = (filename ?? '').split('.').pop()?.toLowerCase() ?? ''
  const known = TYPE_LABELS[extension]
  if (known) return known

  if (mimeType?.startsWith('image/')) return 'Image'
  if (mimeType === 'application/pdf') return 'PDF'

  return extension ? extension.toUpperCase() : 'Document'
}

/** "12 Aug 2026" — short enough for a card line, unambiguous about the month. */
export function citationDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
