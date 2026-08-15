/**
 * A short title for an exported document, derived from the message content so
 * exported files are named after the document itself — never the thread or
 * case name. Mirrors the backend's Message::draftTitle() / deriveTitle() so
 * the browser and server pick the same title.
 */
export function deriveDocumentTitle(content: string, fallback = 'Batayan Response'): string {
  for (const rawLine of documentBody(content).split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^#+\s*/, '').replace(/\*\*/g, '').trim()

    if (line && !line.startsWith('[[')) {
      return line
    }
  }

  return fallback
}

/**
 * The letter body of a drafted reply: chat-only preamble and the hidden
 * document markers are dropped, so the title reflects the document itself.
 * Mirrors extractDocumentText() so it matches what is actually exported.
 */
function documentBody(content: string): string {
  let body = content.replace(/^```(?:python|json|text|plaintext)?\s*\n/i, '').replace(/\n```\s*$/i, '').trim()

  const match = body.match(/\[\[DOCUMENT_START\]\]\s*([\s\S]*?)\s*\[\[DOCUMENT_END\]\]/)

  if (match) {
    body = match[1]
  } else if (body.includes('[[DOCUMENT_START]]')) {
    body = body.slice(body.indexOf('[[DOCUMENT_START]]') + '[[DOCUMENT_START]]'.length)
  }

  return body
    .replace(/^\s*\[\[(?:TODO|DOCUMENT)_(?:START|END)\]\]\s*$/gm, '')
    .replace(/^\s*Next Steps Checklist Created Below Using create_todo Tool:\s*$/gim, '')
    .trim()
}