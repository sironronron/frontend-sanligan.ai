import type { Component } from 'vue'
import {
  FileArchiveIcon,
  FileCodeIcon,
  FileIcon,
  FileImageIcon,
  FileMusicIcon,
  FilePenLineIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileTypeIcon,
  FileVideoCameraIcon,
  PresentationIcon,
} from '@lucide/vue'

/**
 * The icon that stands for a file's type.
 *
 * Every list of uploads — the case rail, the progress view, the documents
 * page, chat attachments — drew the same generic page glyph, so a scanned
 * exhibit photo, a signed PDF and the lawyer's own .docx letterhead template
 * were visually identical and the only way to tell them apart was to read the
 * filename. Resolving the glyph in one place keeps those lists agreeing with
 * each other as new types are accepted.
 *
 * Types are grouped by what the file *is* rather than one glyph per
 * extension: .jpg and .heic are both photographs and want the same picture,
 * while .pdf and .docx are different enough to earn their own.
 */
const EXTENSION_ICONS: Record<string, Component> = {}

function register(icon: Component, extensions: string[]): void {
  for (const extension of extensions) {
    EXTENSION_ICONS[extension] = icon
  }
}

// A finished document: the page-of-text glyph is the most widely read "this is
// a PDF" mark, so it goes to PDFs rather than to plain text.
register(FileTextIcon, ['pdf'])

// Word processing — the letterform glyph reads as "something you typed".
register(FileTypeIcon, ['doc', 'docx', 'odt', 'rtf', 'pages'])

// Plain, editable writing, kept distinct from a finished PDF.
register(FilePenLineIcon, ['txt', 'md', 'markdown', 'log'])

register(FileImageIcon, [
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'tiff', 'tif', 'heic', 'heif', 'bmp', 'svg', 'avif',
])

register(FileSpreadsheetIcon, ['xls', 'xlsx', 'csv', 'tsv', 'ods', 'numbers'])
register(PresentationIcon, ['ppt', 'pptx', 'odp', 'key'])
register(FileArchiveIcon, ['zip', 'rar', '7z', 'tar', 'gz'])
register(FileCodeIcon, ['json', 'xml', 'yml', 'yaml', 'html', 'htm'])
register(FileMusicIcon, ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'])
register(FileVideoCameraIcon, ['mp4', 'mov', 'avi', 'mkv', 'webm'])

/**
 * MIME prefixes, consulted when the filename has no usable extension. Uploads
 * arrive that way often enough to matter — phone photos in particular.
 */
const MIME_PREFIX_ICONS: Array<[string, Component]> = [
  ['image/', FileImageIcon],
  ['audio/', FileMusicIcon],
  ['video/', FileVideoCameraIcon],
]

const MIME_ICONS: Array<[string, Component]> = [
  ['application/pdf', FileTextIcon],
  ['wordprocessingml', FileTypeIcon],
  ['application/msword', FileTypeIcon],
  ['opendocument.text', FileTypeIcon],
  ['spreadsheet', FileSpreadsheetIcon],
  ['application/vnd.ms-excel', FileSpreadsheetIcon],
  ['csv', FileSpreadsheetIcon],
  ['presentation', PresentationIcon],
  ['zip', FileArchiveIcon],
  ['json', FileCodeIcon],
  ['xml', FileCodeIcon],
  ['html', FileCodeIcon],
  ['markdown', FilePenLineIcon],
  ['text/', FilePenLineIcon],
]

export function useFileTypeIcon() {
  function extensionOf(filename: string | null | undefined): string {
    if (!filename) return ''
    const dot = filename.lastIndexOf('.')
    if (dot < 0 || dot === filename.length - 1) return ''

    return filename.slice(dot + 1).toLowerCase()
  }

  /**
   * The extension wins over the MIME type: browsers report a lot of uploads as
   * `application/octet-stream`, and the name the lawyer sees in the list is the
   * thing the icon should agree with.
   */
  function fileIcon(filename: string | null | undefined, mimeType?: string | null): Component {
    const byExtension = EXTENSION_ICONS[extensionOf(filename)]

    if (byExtension) return byExtension

    const mime = (mimeType ?? '').toLowerCase()

    if (mime !== '') {
      for (const [needle, icon] of MIME_ICONS) {
        if (mime.includes(needle)) return icon
      }

      for (const [prefix, icon] of MIME_PREFIX_ICONS) {
        if (mime.startsWith(prefix)) return icon
      }
    }

    return FileIcon
  }

  return { fileIcon, extensionOf }
}
