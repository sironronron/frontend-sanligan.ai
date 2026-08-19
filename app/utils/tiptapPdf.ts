import pdfMake from 'pdfmake/build/pdfmake'
import vfsFonts from 'pdfmake/build/vfs_fonts'
import type { Content, Style, TDocumentDefinitions } from 'pdfmake/interfaces'
import type { SignatureAlign, TiptapDoc, TiptapNode } from '~/types/tiptap'
import { decodeImageSize, fitWithin } from '~/utils/imageUrl'

pdfMake.addVirtualFileSystem(vfsFonts)

const STYLES: Record<string, Style> = {
  h1: { fontSize: 16, bold: true, color: '#1A1A1A', margin: [0, 16, 0, 8] },
  h2: { fontSize: 13, bold: true, color: '#1A1A1A', margin: [0, 12, 0, 6] },
  paragraph: { fontSize: 11, lineHeight: 1.5, margin: [0, 4, 0, 6] },
  listItem: { fontSize: 11, lineHeight: 1.5, margin: [0, 1, 0, 3] },
}

const PAGE = { pageSize: 'LETTER', pageMargins: [64, 64, 64, 64] } as const

/** US Letter width in points, which is what pdfmake measures margins in. */
const PAGE_WIDTH_PT = 612

/**
 * Build a PDF from a Tiptap document. The signature image is embedded directly
 * (pdfmake accepts the base64 payload of a data URL), wrapped in an
 * `unbreakable` block so a signature is never split across a page break.
 */
export async function buildPdfFromTiptap(doc: TiptapDoc, title: string): Promise<Blob> {
  const definition: TDocumentDefinitions = {
    pageSize: 'LETTER',
    pageMargins: [64, 64, 64, 64],
    info: { title },
    content: await docToContent(doc),
    defaultStyle: { font: 'Roboto', fontSize: 11 },
    styles: STYLES,
  }

  return pdfMake.createPdf(definition).getBlob()
}

async function docToContent(doc: TiptapDoc): Promise<Content[]> {
  const content: Content[] = []
  for (const node of doc.content ?? []) {
    content.push(await nodeToContent(node))
  }
  return content
}

async function nodeToContent(node: TiptapNode): Promise<Content> {
  switch (node.type) {
    case 'heading': {
      const level = Number(node.attrs?.level ?? 1)
      return { style: level === 1 ? 'h1' : 'h2', text: inlineToText(node.content) }
    }

    case 'paragraph':
      return { style: 'paragraph', text: inlineToText(node.content) }

    case 'bulletList':
      return { ul: await Promise.all((node.content ?? []).map((item) => listItemContent(item))) }

    case 'orderedList':
      return { ol: await Promise.all((node.content ?? []).map((item) => listItemContent(item))) }

    case 'blockquote':
      return { stack: await Promise.all((node.content ?? []).map((block) => nodeToContent(block))) }

    case 'signature':
      return signatureContent(node)

    case 'image':
      return await imageContent(node)

    default:
      return { style: 'paragraph', text: '' }
  }
}

/**
 * A list item's own line, plus anything else the item holds.
 *
 * Only the first paragraph used to be rendered, so a signature or an image
 * that happened to sit inside a bullet — which is where the editor puts one
 * when the cursor is in a list — vanished from the PDF without a trace.
 */
async function listItemContent(item: TiptapNode): Promise<Content> {
  const blocks = item.content ?? []
  const paragraph = blocks.find((block) => block.type === 'paragraph')
  const line: Content = { style: 'listItem', text: inlineToText(paragraph?.content) }

  const rest = blocks.filter((block) => block !== paragraph)
  if (rest.length === 0) return line

  const stack: Content[] = [line]
  for (const block of rest) {
    stack.push(await nodeToContent(block))
  }

  return { stack }
}

/**
 * Render an embedded image. pdfmake needs the full data URL (it rejects a bare
 * base64 payload as "not found in virtual file system") plus explicit
 * dimensions, so stored width/height are reused or the image is decoded.
 */
async function imageContent(node: TiptapNode): Promise<Content> {
  const attrs = (node.attrs ?? {}) as {
    src?: string
    width?: number | null
    height?: number | null
  }

  if (!attrs.src) return { text: '' }

  const size = attrs.width && attrs.height
    ? { width: attrs.width, height: attrs.height }
    : await decodeImageSize(attrs.src)

  // LETTER page has ~6.4in of content width; cap inside the margins.
  const { width, height } = fitWithin(size.width, size.height, 480, 650)

  return { image: attrs.src, width, height, alignment: 'center', margin: [0, 4, 0, 8] }
}

/**
 * Collapse a node's inline children into pdfmake's text array, turning marks
 * into per-segment styling and hard breaks into newlines.
 */
function inlineToText(content: TiptapNode[] | undefined): Content {
  if (!content || content.length === 0) return ''

  const segments: Content[] = []

  for (const child of content) {
    if (child.type === 'hardBreak') {
      segments.push('\n')
      continue
    }

    if (child.type !== 'text' || typeof child.text !== 'string') continue

    const marks = child.marks ?? []
    const styled = marks.some((m) => m.type === 'bold')
      || marks.some((m) => m.type === 'italic')
      || marks.some((m) => m.type === 'highlight')

    if (!styled) {
      segments.push(child.text)
      continue
    }

    segments.push({
      text: child.text,
      bold: marks.some((m) => m.type === 'bold'),
      italics: marks.some((m) => m.type === 'italic'),
      background: marks.some((m) => m.type === 'highlight') ? '#FDE047' : undefined,
    })
  }

  return segments
}

function signatureContent(node: TiptapNode): Content {
  const attrs = (node.attrs ?? {}) as {
    src?: string | null
    signedAt?: string | null
    signerName?: string | null
    width?: number | null
    height?: number | null
    align?: SignatureAlign
    offsetX?: number | null
  }

  const { width, height } = scaledSignatureSize(attrs.width ?? 720, attrs.height ?? 240)

  const stack: Content[] = []

  if (attrs.src) {
    // pdfmake accepts the full data URL ("data:image/png;base64,...") and
    // registers it into its images dictionary on the fly. Stripping the
    // prefix made it treat the bare base64 as a virtual-file key and throw
    // "not found in virtual file system", failing every export.
    stack.push({ image: attrs.src, width, height })
  }

  if (attrs.signerName) {
    stack.push({ text: attrs.signerName, bold: true, margin: [0, 4, 0, 0] })
  }

  if (attrs.signedAt) {
    stack.push({ text: formatSignatureDate(attrs.signedAt), fontSize: 9, color: '#666666', margin: [0, 2, 0, 0] })
  }

  // A dragged signature carries its own position across the line, so it is
  // laid out from the left edge with that offset as a margin rather than by
  // the coarse alignment.
  if (typeof attrs.offsetX === 'number' && Number.isFinite(attrs.offsetX)) {
    return {
      alignment: 'left',
      margin: [signatureLeftMargin(attrs.offsetX), 32, 0, 0],
      unbreakable: true,
      stack,
    }
  }

  return {
    alignment: attrs.align ?? 'right',
    margin: [0, 32, 0, 0],
    unbreakable: true,
    stack,
  }
}

/**
 * Turn a dragged signature's `offsetX` percentage into a left margin in
 * points, measured against the printable width of the page.
 */
function signatureLeftMargin(offsetX: number): number {
  const printableWidth = PAGE_WIDTH_PT - PAGE.pageMargins[0] - PAGE.pageMargins[2]
  const clamped = Math.min(Math.max(offsetX, 0), 100)

  return Math.round((clamped / 100) * printableWidth)
}

/** Cap the signature image so it sits comfortably inside a letter's margins. */
function scaledSignatureSize(width: number, height: number): { width: number; height: number } {
  const MAX_WIDTH = 220
  const MAX_HEIGHT = 80

  if (width <= 0 || height <= 0) return { width: 160, height: 60 }

  const scale = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height, 1)

  return {
    width: Math.max(Math.round(width * scale), 1),
    height: Math.max(Math.round(height * scale), 1),
  }
}

function formatSignatureDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}