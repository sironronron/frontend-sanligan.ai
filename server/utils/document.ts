/**
 * Extract only the marked document from a drafted reply. Chat-only content
 * before the opening marker and after the closing marker is dropped. When no
 * markers are present, the full content is used so legacy messages still
 * export in full. Drafts missing the closing marker (common: the model
 * reliably opens with [[DOCUMENT_START]] but often omits the end marker) are
 * exported from the opening marker onward. Hidden todo/document markers are
 * never exported.
 */
export function extractDocumentText(content: string): string {
  const match = content.match(/\[\[DOCUMENT_START\]\]\s*([\s\S]*?)\s*\[\[DOCUMENT_END\]\]/)

  let body: string

  if (match) {
    body = match[1]
  } else if (content.includes('[[DOCUMENT_START]]')) {
    body = content.slice(content.indexOf('[[DOCUMENT_START]]') + '[[DOCUMENT_START]]'.length)
  } else {
    body = content
  }

  return stripHiddenMarkers(body).trim()
}

/**
 * Remove hidden markers and any meta commentary the model wrote around the
 * checklist so exported files only contain user-visible text.
 */
function stripHiddenMarkers(text: string): string {
  return text
    .replace(/^\s*\[\[(?:TODO|DOCUMENT)_(?:START|END)\]\]\s*$/gm, '')
    .replace(/^\s*Next Steps Checklist Created Below Using create_todo Tool:\s*$/gim, '')
}

/**
 * Remove any export/download links or placeholder labels the model wrote so
 * the exported file only contains the document itself.
 */
export function stripExportLinks(text: string): string {
  return text
    .replace(/\s*\[[^\]]*(?:download|export)[^\]]*\]\((?:https?:\/\/|\/)[^)]*\)/gi, '')
    .replace(/^[ \t]*(?:\*\*)?\s*(?:export|download)\s+links?\s*(?:\*\*)?\s*:?\s*$/gim, '')
    .replace(/\[\s*\[[^\]]*\]\s*(?:\|\s*\[[^\]]+\]\s*)*[.:;]?|\[[^\]]*(?:download|word document|exported|pdf|insert export)[^\]]*\]\s*(?:\|\s*\[[^\]]+\]\s*)*|\s*(?:as|for|to)\s+word\s+and\s+pdf\s+export\s*:?\s*\[[^\]]+\]\s*[.:;]?[\r\n]*/gi, '')
    // Strip ATTACHMENTS section: horizontal rule + heading + body until next heading or end
    .replace(/\s*-{3,}\s*\*{0,2}\s*ATTACHMENTS?\s*\*{0,2}\s*:?\s*[^\n]*(?:\n(?!\s*(?:#{1,6}\s|\*{2}\s*\[NOTE))[\s\S]*)?/gi, '')
    .trim()
}

/**
 * Derive a title from the message content, mirroring how the backend names
 * exported files: the first non-empty line with markdown markers removed.
 */
export function deriveTitleFromContent(content: string, fallback = 'Batayan Response'): string {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^#+\s*/, '').replace(/\*\*/g, '').trim()
    if (line && !line.startsWith('[[')) {
      return line
    }
  }

  return fallback
}

/**
 * Sanitize a proposed filename so it is safe to use in Content-Disposition.
 */
export function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9\s\-_]/g, '').trim().replace(/\s+/g, '_')

  return cleaned.slice(0, 60) || 'response'
}
