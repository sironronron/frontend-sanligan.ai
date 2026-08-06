/**
 * Extract only the marked document from a drafted reply. Chat-only content
 * before the opening marker and after the closing marker is dropped. When no
 * markers are present, the full content is used so legacy messages still
 * export in full.
 */
export function extractDocumentText(content: string): string {
  const match = content.match(/\[\[DOCUMENT_START\]\]\s*([\s\S]*?)\s*\[\[DOCUMENT_END\]\]/)

  return (match?.[1] ?? content).trim()
}

/**
 * Remove any export/download links or placeholder labels the model wrote so
 * the exported file only contains the document itself.
 */
export function stripExportLinks(text: string): string {
  return text
    .replace(/\s*\[[^\]]*(?:download|export)[^\]]*\]\((?:https?:\/\/|\/)[^)]*\)/gi, '')
    .replace(/^[ \t]*(?:\*\*)?\s*(?:export|download)\s+links?\s*(?:\*\*)?\s*:?\s*$/gim, '')
    .replace(/\[\s*\[[^\]]*\]\s*(?:\|\s*\[[^\]]+\]\s*)*[.:;]?|\[[^\]]*(?:download|word document|exported|pdf)[^\]]*\]\s*(?:\|\s*\[[^\]]+\]\s*)*[.:;]?[\r\n]*/gi, '')
    .trim()
}

/**
 * Derive a title from the message content, mirroring how the backend names
 * exported files: the first non-empty line with markdown markers removed.
 */
export function deriveTitleFromContent(content: string, fallback = 'Saligan AI Response'): string {
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
