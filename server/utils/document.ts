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

/**
 * Extract only the marked document from a drafted reply. Chat-only content
 * before the opening marker and after the closing marker is dropped. When no
 * markers are present, the full content is used so legacy messages still export
 * in full. Drafts missing the closing marker (common: the model
 * reliably opens with [[DOCUMENT_START]] but often omits the end marker) are
 * exported from the opening marker onward. Hidden todo/document markers are
 * never exported.
 */
export function extractDocumentText(content: string): string {
  let body = content

  // Strip code-fence wrappers first
  body = stripCodeFencesAndInternalReasoning(body)

  const match = body.match(/\[\[DOCUMENT_START\]\]\s*([\s\S]*?)\s*\[\[DOCUMENT_END\]\]/)

  if (match) {
    body = match[1]
  } else if (body.includes('[[DOCUMENT_START]]')) {
    body = body.slice(body.indexOf('[[DOCUMENT_START]]') + '[[DOCUMENT_START]]'.length)
  }

  return stripTrailingMarkdownArtifacts(stripPreamble(stripDisclaimer(stripHiddenMarkers(body)))).trim()
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
 * Remove the legal disclaimer that the model sometimes includes inside the
 * document markers. The disclaimer belongs outside the markers but the model
 * occasionally leaks it into the exported body.
 */
function stripDisclaimer(text: string): string {
  return text
    .replace(/\s*Disclaimer:\s*I'm a legal research and drafting-support assistant,\s*not a licensed Philippine attorney\.\s*This analysis should be reviewed by your lawyer before use in negotiation or litigation\.?\s*/gi, '')
    .replace(/\s*\*+\s*Disclaimer:\s*I'm a legal research and drafting-support assistant,\s*not a licensed Philippine attorney\.\s*This analysis should be reviewed by your lawyer before use in negotiation or litigation\.?\s*\*+\s*/gi, '')
    .trim()
}

/**
 * Remove the meta-introduction paragraph the model sometimes writes before
 * the letter (e.g. "Based on the documents provided …, here is a formal
 * Demand Letter …"). Only the leading paragraph is considered, so letter
 * content is never touched.
 */
function stripPreamble(text: string): string {
  const lines = text.split(/\r?\n/)
  let start = 0

  // Skip leading blank lines
  while (start < lines.length && lines[start].trim() === '') {
    start++
  }

  if (start >= lines.length || !isPreambleStart(lines[start].trim())) {
    return text
  }

  // Find the end of the preamble paragraph (next blank line)
  let end = start
  while (end < lines.length && lines[end].trim() !== '') {
    end++
  }

  // Return everything after the preamble
  return lines.slice(end).join('\n')
}

/**
 * Whether a line opens a meta-introduction to the letter rather than the
 * letter itself.
 */
function isPreambleStart(line: string): boolean {
  const lower = line.toLowerCase()

  const phrases = [
    'based on the documents provided',
    'based on your specific requirements',
    'based on your request',
    'based on the provided',
    'based on the above',
    'based on the information you provided',
    'here is your',
    'here is the',
    'here is a',
    'here is an',
    'below is',
    'as requested',
    'per your request',
    'attached herewith',
    'please find',
    'the following is',
    'we have prepared',
    'i have prepared',
    'i have drafted',
    'we have drafted',
    'in response to your request',
    'this letter serves',
    'this document serves',
    'draft a letter',
    'drafting a letter',
    'draft letter',
  ]

  return phrases.some(phrase => lower.includes(phrase))
}

/**
 * Strip trailing markdown artifacts like standalone asterisks, underscores,
 * or other formatting remnants that the model sometimes leaves at the end
 * of the document.
 */
function stripTrailingMarkdownArtifacts(text: string): string {
  // Remove trailing standalone asterisks, underscores, or other markdown artifacts
  // Matches lines that are only made up of *, _, ~, or combinations
  return text
    .replace(/\n\s*[*_~]{1,3}\s*$/, '')
    .trim()
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
 * exported files: the first non-empty line of the extracted document body with
 * markdown markers removed. Chat-only preamble and hidden markers never become
 * the title.
 */
export function deriveTitleFromContent(content: string, fallback = 'Batayan Response'): string {
  for (const rawLine of extractDocumentText(content).split(/\r?\n/)) {
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
