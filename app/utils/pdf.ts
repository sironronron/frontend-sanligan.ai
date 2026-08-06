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
 */
function extractDocumentText(content: string): string {
  const match = content.match(/\[\[DOCUMENT_START\]\]\s*([\s\S]*?)\s*\[\[DOCUMENT_END\]\]/)

  return (match?.[1] ?? content).trim()
}

/**
 * Remove export/download links and placeholder labels the model wrote.
 */
function stripExportLinks(text: string): string {
  return text
    .replace(/\s*\[[^\]]*(?:download|export)[^\]]*\]\((?:https?:\/\/|\/)[^)]*\)/gi, '')
    .replace(/^[ \t]*(?:\*\*)?\s*(?:export|download)\s+links?\s*(?:\*\*)?\s*:?\s*$/gim, '')
    .trim()
}

/**
 * Derive a title from the message content when none is supplied.
 */
function deriveTitleFromContent(content: string, fallback = 'Saligan AI Response'): string {
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

  const flush = () => {
    if (paragraphBuffer.length === 0) return
    const text = paragraphBuffer.join('\n')
    paragraphBuffer = []
    if (text.trim() !== '') {
      body.push({ text: toContent(parseRuns(text)), style: 'paragraph' })
    }
  }

  for (const rawLine of documentText.split(/\r?\n/)) {
    const line = rawLine.trimEnd()

    if (line.trim() === '') {
      flush()
      continue
    }

    const heading1 = line.match(/^# (.+)$/)
    if (heading1) {
      flush()
      body.push({ text: toContent(parseRuns(heading1[1])), style: 'h1' })
      continue
    }

    const heading2 = line.match(/^## (.+)$/)
    if (heading2) {
      flush()
      body.push({ text: toContent(parseRuns(heading2[1])), style: 'h2' })
      continue
    }

    const heading3 = line.match(/^### (.+)$/)
    if (heading3) {
      flush()
      body.push({ text: toContent(parseRuns(heading3[1])), style: 'h3' })
      continue
    }

    const bullet = line.match(/^[-*]\s+(.+)$/)
    if (bullet) {
      flush()
      body.push({ ul: [{ text: toContent(parseRuns(bullet[1])), style: 'listItem' }] })
      continue
    }

    const numbered = line.match(/^(\d+)[.)]\s+(.+)$/)
    if (numbered) {
      flush()
      body.push({ ol: [{ text: toContent(parseRuns(numbered[2])), style: 'listItem' }] })
      continue
    }

    paragraphBuffer.push(line)
  }

  flush()

  return {
    info: { title, author: 'Saligan.AI' },
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
