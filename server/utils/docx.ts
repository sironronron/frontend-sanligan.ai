import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
  type IRunOptions,
} from 'docx'
import { extractDocumentText, stripExportLinks } from './document'

const PAGE_WIDTH = 11906
const PAGE_HEIGHT = 16838
const MARGIN = 1440

const CODE_COLOR = 'C7254E'

const NUMBERING = {
  config: [
    {
      reference: 'saligan-bullets',
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
      reference: 'saligan-numbered',
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

/**
 * Build a Word document from drafted markdown content. Inline bold, italic,
 * and code formatting is carried into the runs so the .docx mirrors what the
 * user sees in chat.
 */
export async function buildDocx(content: string, title: string): Promise<Buffer> {
  const documentText = stripExportLinks(extractDocumentText(content))
  const children = parseMarkdown(documentText)

  const doc = new Document({
    creator: 'Batayan',
    title,
    styles: {
      default: {
        document: {
          run: {
            font: 'Calibri',
            size: 22,
          },
        },
      },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: 'Calibri', size: 36, bold: true, color: '1A1A1A' },
          paragraph: { spacing: { before: 320, after: 160 }, keepNext: true },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: 'Calibri', size: 28, bold: true, color: '1A1A1A' },
          paragraph: { spacing: { before: 280, after: 120 }, keepNext: true },
        },
        {
          id: 'Heading3',
          name: 'Heading 3',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: 'Calibri', size: 24, bold: true, color: '1A1A1A' },
          paragraph: { spacing: { before: 240, after: 100 }, keepNext: true },
        },
      ],
    },
    numbering: NUMBERING,
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
          },
        },
        children,
      },
    ],
  })

  return Packer.toBuffer(doc)
}

function parseMarkdown(markdown: string): Paragraph[] {
  const lines = markdown.split(/\r?\n/)
  const paragraphs: Paragraph[] = []
  let paragraphBuffer: string[] = []

  const flush = () => {
    if (paragraphBuffer.length === 0) return
    const text = paragraphBuffer.join('\n')
    paragraphBuffer = []
    if (text.trim() !== '') {
      paragraphs.push(bodyParagraph(text))
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()

    if (line.trim() === '') {
      flush()
      continue
    }

    if (line.startsWith('### ')) {
      flush()
      paragraphs.push(heading(3, line.slice(4)))
      continue
    }

    if (line.startsWith('## ')) {
      flush()
      paragraphs.push(heading(2, line.slice(3)))
      continue
    }

    if (line.startsWith('# ')) {
      flush()
      paragraphs.push(heading(1, line.slice(2)))
      continue
    }

    const bullet = line.match(/^[-*]\s+(.+)$/)
    if (bullet) {
      flush()
      paragraphs.push(listItem(bullet[1], 'bullets'))
      continue
    }

    const numbered = line.match(/^(\d+)[.)]\s+(.+)$/)
    if (numbered) {
      flush()
      paragraphs.push(listItem(numbered[2], 'numbered'))
      continue
    }

    paragraphBuffer.push(line)
  }

  flush()

  if (paragraphs.length === 0) {
    paragraphs.push(bodyParagraph(''))
  }

  return paragraphs
}

function heading(level: 1 | 2 | 3, text: string): Paragraph {
  const headingLevel =
    level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3

  return new Paragraph({
    heading: headingLevel,
    children: parseRuns(text),
  })
}

function listItem(text: string, reference: 'bullets' | 'numbered'): Paragraph {
  return new Paragraph({
    numbering: { reference, level: 0 },
    children: parseRuns(text),
    spacing: { after: 120 },
  })
}

function bodyParagraph(text: string): Paragraph {
  return new Paragraph({
    children: parseRuns(text),
    spacing: { after: 160 },
  })
}

function parseRuns(text: string, base: IRunOptions = {}): TextRun[] {
  const runs: TextRun[] = []

  const codeParts = text.split(/`([^`]+)`/)
  for (let i = 0; i < codeParts.length; i++) {
    if (i % 2 === 1) {
      const code = codeParts[i]
      if (code.trim() !== '') {
        runs.push(new TextRun({ ...base, text: code, font: 'Consolas', color: CODE_COLOR }))
      }
      continue
    }

    parseBoldItalic(codeParts[i], runs, base)
  }

  return runs
}

function parseBoldItalic(text: string, runs: TextRun[], base: IRunOptions): void {
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

function parseItalic(text: string, runs: TextRun[], base: IRunOptions): void {
  const italicParts = text.split(/\*(.+?)\*/)
  for (let i = 0; i < italicParts.length; i++) {
    const part = italicParts[i]
    if (part.trim() === '') continue

    if (i % 2 === 1) {
      runs.push(new TextRun({ ...base, text: part, italics: true }))
    } else {
      runs.push(new TextRun({ ...base, text: part }))
    }
  }
}
