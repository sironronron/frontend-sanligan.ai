import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
  type IRunOptions,
  type ParagraphChild,
} from 'docx'
import type { SignatureAlign, TiptapDoc, TiptapNode } from '~/types/tiptap'
import { dataUrlToBytes, decodeImageSize, docxImageType, fitWithin } from '~/utils/imageUrl'

const PAGE_WIDTH = 11906
const PAGE_HEIGHT = 16838
const MARGIN = 1440

const NUMBERING = {
  config: [
    {
      reference: 'letter-bullets',
      levels: [
        {
          level: 0,
          format: LevelFormat.BULLET,
          text: '•',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        },
      ],
    },
    {
      reference: 'letter-numbered',
      levels: [
        {
          level: 0,
          format: LevelFormat.DECIMAL,
          text: '%1.',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        },
      ],
    },
  ],
}

interface ListState {
  inList: boolean
  numbered: boolean
}

/**
 * Build a Word document from a Tiptap document. The signature node's image is
 * embedded as a real image run so the .docx carries the drawn or typed
 * signature, and lists map onto Word numbering.
 */
export async function buildDocxFromTiptap(doc: TiptapDoc, title: string): Promise<Blob> {
  const children = await docToParagraphs(doc, { inList: false, numbered: false })

  const wordDoc = new Document({
    creator: 'Batayan',
    title,
    numbering: NUMBERING,
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
          },
        },
        children,
      },
    ],
    styles: {
      default: {
        document: {
          run: {
            font: 'Georgia',
            size: 24,
          },
        },
      },
    },
  })

  return Packer.toBlob(wordDoc)
}

/**
 * Flatten a Tiptap block into Word paragraphs. List items are turned into the
 * list's own paragraphs rather than nested content, matching how Word
 * represents a flat list.
 */
async function docToParagraphs(doc: TiptapDoc, state: ListState): Promise<Paragraph[]> {
  const paragraphs: Paragraph[] = []

  for (const node of doc.content ?? []) {
    paragraphs.push(...(await pushBlock(node, state)))
  }

  return paragraphs
}

async function pushBlock(node: TiptapNode, state: ListState): Promise<Paragraph[]> {
  switch (node.type) {
    case 'paragraph':
      return [paragraphFromNode(node, state)]

    case 'heading': {
      const level = Number(node.attrs?.level ?? 1)
      return [
        new Paragraph({
          children: runsFromContent(node.content),
          heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 160 },
          keepNext: true,
        }),
      ]
    }

    case 'bulletList':
    case 'orderedList': {
      const numbered = node.type === 'orderedList'
      const paragraphs: Paragraph[] = []
      for (const item of node.content ?? []) {
        for (const block of item.content ?? []) {
          if (block.type === 'paragraph') {
            paragraphs.push(paragraphFromNode(block, { inList: true, numbered }))
            continue
          }

          // Anything else inside a list item — a signature the user dropped
          // while the cursor sat in a bullet, an image, a nested list — used
          // to be thrown away here, which is how a signature could show in
          // the editor and be missing from the exported file. Render it as a
          // block of its own instead.
          paragraphs.push(...(await pushBlock(block, state)))
        }
      }
      return paragraphs
    }

    case 'blockquote': {
      const paragraphs: Paragraph[] = []
      for (const block of node.content ?? []) {
        paragraphs.push(...(await pushBlock(block, state)))
      }
      return paragraphs
    }

    case 'signature':
      return [signatureParagraph(node)]

    case 'image':
      return [await imageParagraph(node)]

    default:
      // Unknown nodes (e.g. a stray hardBreak at block level) are dropped.
      return []
  }
}

function paragraphFromNode(node: TiptapNode, state: ListState): Paragraph {
  return new Paragraph({
    children: runsFromContent(node.content),
    spacing: { after: 160 },
    ...(state.inList
      ? { numbering: { reference: state.numbered ? 'letter-numbered' : 'letter-bullets', level: 0 } }
      : {}),
  })
}

/**
 * Convert a node's inline content into text runs. A `hardBreak` becomes a
 * line break run so addresses stay on separate lines within one paragraph.
 */
function runsFromContent(content: TiptapNode[] | undefined): TextRun[] {
  if (!content) return []

  const runs: TextRun[] = []

  for (const child of content) {
    if (child.type === 'hardBreak') {
      runs.push(new TextRun({ break: 1 }))
      continue
    }

    if (child.type === 'text' && typeof child.text === 'string') {
      runs.push(new TextRun(textRunOptions(child)))
    }
  }

  return runs
}

function textRunOptions(node: TiptapNode): IRunOptions {
  const marks = node.marks ?? []

  return {
    text: node.text,
    ...(marks.some((m) => m.type === 'bold') ? { bold: true } : {}),
    ...(marks.some((m) => m.type === 'italic') ? { italics: true } : {}),
    ...(marks.some((m) => m.type === 'highlight') ? { highlight: 'yellow' } : {}),
  }
}

/**
 * Render the signature node: the image (if signed), then the signer's printed
 * name and the date on the lines below, as a letter's signature block reads.
 */
function signatureParagraph(node: TiptapNode): Paragraph {
  const attrs = (node.attrs ?? {}) as {
    src?: string | null
    signedAt?: string | null
    signerName?: string | null
    width?: number | null
    height?: number | null
    align?: SignatureAlign
    offsetX?: number | null
  }

  const children: ParagraphChild[] = []

  if (attrs.src) {
    const { width, height } = scaledSignatureSize(attrs.width ?? 720, attrs.height ?? 240)
    children.push(
      new ImageRun({
        type: 'png',
        data: dataUrlToBytes(attrs.src),
        transformation: { width, height },
      }),
    )
  }

  if (attrs.signerName) {
    children.push(new TextRun({ break: 1, text: attrs.signerName, bold: true }))
  }

  if (attrs.signedAt) {
    children.push(new TextRun({ break: 1, text: formatSignatureDate(attrs.signedAt), color: '666666' }))
  }

  // A dragged signature carries its own position across the line: indent it by
  // that much of the printable width and left-align it, so Word puts it where
  // the editor showed it instead of snapping it back to an alignment.
  if (typeof attrs.offsetX === 'number' && Number.isFinite(attrs.offsetX)) {
    return new Paragraph({
      children,
      alignment: AlignmentType.LEFT,
      indent: { left: signatureIndent(attrs.offsetX) },
      spacing: { before: 400, after: 160 },
    })
  }

  return new Paragraph({
    children,
    alignment: attrs.align === 'left'
      ? AlignmentType.LEFT
      : attrs.align === 'center'
        ? AlignmentType.CENTER
        : AlignmentType.RIGHT,
    spacing: { before: 400, after: 160 },
  })
}

/**
 * Turn a dragged signature's `offsetX` percentage into a Word indent in
 * twips, measured against the printable width of the page.
 */
function signatureIndent(offsetX: number): number {
  const printableWidth = PAGE_WIDTH - MARGIN * 2
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

/**
 * Render an embedded image as its own paragraph. The stored width/height are
 * used when available; otherwise the image is decoded to measure it.
 */
async function imageParagraph(node: TiptapNode): Promise<Paragraph> {
  const attrs = (node.attrs ?? {}) as {
    src?: string
    width?: number | null
    height?: number | null
  }

  if (!attrs.src) return new Paragraph({ children: [] })

  const size = attrs.width && attrs.height
    ? { width: attrs.width, height: attrs.height }
    : await decodeImageSize(attrs.src)

  // A letter's text column is ~6.5in; cap the image inside the margins.
  const { width, height } = fitWithin(size.width, size.height, 580, 700)

  return new Paragraph({
    children: [
      new ImageRun({
        type: docxImageType(attrs.src),
        data: dataUrlToBytes(attrs.src),
        transformation: { width, height },
      }),
    ],
    alignment: AlignmentType.CENTER,
    spacing: { after: 160 },
  })
}

function formatSignatureDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}