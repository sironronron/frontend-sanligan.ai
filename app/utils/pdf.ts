import pdfMake from 'pdfmake/build/pdfmake'
import vfsFonts from 'pdfmake/build/vfs_fonts'
import type { Content, Style, TDocumentDefinitions } from 'pdfmake/interfaces'

pdfMake.addVirtualFileSystem(vfsFonts)

const CODE_COLOR = '#C7254E'
const HEADING_COLOR = '#1A1A1A'

const STYLES: Record<string, Style> = {
  h1: { fontSize: 18, bold: true, color: HEADING_COLOR, margin: [0, 14, 0, 8] },
  h2: { fontSize: 15, bold: true, color: HEADING_COLOR, margin: [0, 12, 0, 6] },
  h3: { fontSize: 13, bold: true, color: HEADING_COLOR, margin: [0, 10, 0, 5] },
  paragraph: { fontSize: 11, lineHeight: 1.4, margin: [0, 4, 0, 6] },
  listItem: { fontSize: 11, lineHeight: 1.4, margin: [0, 1, 0, 3] },
  code: { fontSize: 10, color: CODE_COLOR },
}

/**
 * Extract only the marked document from a drafted reply. Mirrors
 * server/utils/document.ts so the browser build produces the same output.
 * Drafts missing the closing marker are exported from the opening marker
 * onward, and hidden todo/document markers are never exported.
 */
function extractDocumentText(content: string): string {
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
 * Remove export/download links and placeholder labels the model wrote.
 */
function stripExportLinks(text: string): string {
  return text
    .replace(/\s*\[[^\]]*(?:download|export)[^\]]*\]\((?:https?:\/\/|\/)[^)]*\)/gi, '')
    .replace(/^[ \t]*(?:\*\*)?\s*(?:export|download)\s+links?\s*(?:\*\*)?\s*:?\s*$/gim, '')
    .replace(/\[\s*\[[^\]]*\]\s*(?:\|\s*\[[^\]]+\]\s*)*[.:;]?|\[[^\]]*(?:download|word document|exported|pdf|insert export)[^\]]*\]\s*(?:\|\s*\[[^\]]+\]\s*)*|\s*(?:as|for|to)\s+word\s+and\s+pdf\s+export\s*:?\s*\[[^\]]+\]\s*[.:;]?[\r\n]*/gi, '')
    // Strip ATTACHMENTS section: horizontal rule + heading + body until next heading or end
    .replace(/\s*-{3,}\s*\*{0,2}\s*ATTACHMENTS?\s*\*{0,2}\s*:?\s*[^\n]*(?:\n(?!\s*(?:#{1,6}\s|\*{2}\s*\[NOTE))[\s\S]*)?/gi, '')
    .trim()
}

/**
 * Derive a title from the message content when none is supplied.
 */
function deriveTitleFromContent(content: string, fallback = 'Batayan Response'): string {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^#+\s*/, '').replace(/\*\*/g, '').trim()
    if (line && !line.startsWith('[[')) {
      return line
    }
  }

  return fallback
}

interface Run {
  text: string
  bold?: boolean
  italics?: boolean
  style?: string
}

function parseRuns(text: string, base: { bold?: boolean; italics?: boolean } = {}): Run[] {
  const runs: Run[] = []

  const codeParts = text.split(/`([^`]+)`/)
  for (let i = 0; i < codeParts.length; i++) {
    if (i % 2 === 1) {
      const code = codeParts[i]
      if (code.trim() !== '') {
        runs.push({ text: code, style: 'code', ...base })
      }
      continue
    }

    parseBoldItalic(codeParts[i], runs, base)
  }

  return runs
}

function parseBoldItalic(text: string, runs: Run[], base: { bold?: boolean; italics?: boolean }): void {
  const boldParts = text.split(/\*\*(.+?)\*\*/)
  for (let i = 0; i < boldParts.length; i++) {
    const part = boldParts[i]
    if (i % 2 === 1) {
      parseItalic(part, runs, { ...base, bold: true })
    } else {
      parseItalic(part, runs, base)
    }
  }
}

function parseItalic(text: string, runs: Run[], base: { bold?: boolean; italics?: boolean }): void {
  const italicParts = text.split(/\*(.+?)\*/)
  for (let i = 0; i < italicParts.length; i++) {
    const part = italicParts[i]
    if (part.trim() === '') continue

    if (i % 2 === 1) {
      runs.push({ text: part, italics: true, ...base })
    } else {
      runs.push({ text: part, ...base })
    }
  }
}

function toContent(runs: Run[]): Content {
  const inline = runs.map((r) => ({
    text: r.text,
    ...(r.bold ? { bold: true } : {}),
    ...(r.italics ? { italics: true } : {}),
    ...(r.style ? { style: r.style } : {}),
  }))

  if (inline.length === 1 && !inline[0].bold && !inline[0].italics && !inline[0].style) {
    return inline[0].text
  }

  return inline
}

/**
 * Convert drafted markdown into a pdfmake document definition so the PDF
 * mirrors what the user sees in chat (headings, lists, inline formatting).
 */
export function markdownToPdfDefinition(content: string, title: string): TDocumentDefinitions {
  const documentText = stripExportLinks(extractDocumentText(content))
  const body: Content[] = []
  let paragraphBuffer: string[] = []
  let numberedBuffer: Content[] = []

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return
    const text = paragraphBuffer.join('\n')
    paragraphBuffer = []
    if (text.trim() !== '') {
      body.push({ text: toContent(parseRuns(text)), style: 'paragraph' })
    }
  }

  const flushNumbered = () => {
    if (numberedBuffer.length === 0) return
    body.push({ ol: numberedBuffer })
    numberedBuffer = []
  }

  for (const rawLine of documentText.split(/\r?\n/)) {
    const line = rawLine.trimEnd()

    if (line.trim() === '') {
      flushParagraph()
      flushNumbered()
      continue
    }

    const heading1 = line.match(/^# (.+)$/)
    if (heading1) {
      flushParagraph()
      flushNumbered()
      body.push({ text: toContent(parseRuns(heading1[1])), style: 'h1' })
      continue
    }

    const heading2 = line.match(/^## (.+)$/)
    if (heading2) {
      flushParagraph()
      flushNumbered()
      body.push({ text: toContent(parseRuns(heading2[1])), style: 'h2' })
      continue
    }

    const heading3 = line.match(/^### (.+)$/)
    if (heading3) {
      flushParagraph()
      flushNumbered()
      body.push({ text: toContent(parseRuns(heading3[1])), style: 'h3' })
      continue
    }

    if (/^x-{4,}x$/.test(line.trim())) {
      flushParagraph()
      flushNumbered()
      body.push({
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#999999' }],
        margin: [0, 6, 0, 6],
      })
      continue
    }

    const bullet = line.match(/^[-*]\s+(.+)$/)
    if (bullet) {
      flushParagraph()
      flushNumbered()
      body.push({ ul: [{ text: toContent(parseRuns(bullet[1])), style: 'listItem' }] })
      continue
    }

    const numbered = line.match(/^(\d+)[.)]\s+(.+)$/)
    if (numbered) {
      flushParagraph()
      numberedBuffer.push({ text: toContent(parseRuns(numbered[2])), style: 'listItem' })
      continue
    }

    flushNumbered()
    paragraphBuffer.push(line)
  }

  flushParagraph()
  flushNumbered()

  return {
    info: { title, author: 'Batayan' },
    pageSize: 'A4',
    pageMargins: [60, 60, 60, 60],
    defaultStyle: { font: 'Roboto', fontSize: 11, lineHeight: 1.4 },
    styles: STYLES,
    content: body.length > 0 ? body : [{ text: '', style: 'paragraph' }],
  }
}

/**
 * Generate a PDF Blob in the browser from drafted markdown content.
 */
export function buildPdfBlob(content: string, title: string): Promise<Blob> {
  const effectiveTitle = title.trim() || deriveTitleFromContent(content)
  const definition = markdownToPdfDefinition(content, effectiveTitle)

  return pdfMake.createPdf(definition).getBlob()
}
