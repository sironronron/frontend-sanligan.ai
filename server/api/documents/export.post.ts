import { setResponseHeader } from 'h3'
import { buildDocx } from '../../utils/docx'
import { deriveTitleFromContent, sanitizeFilename } from '../../utils/document'

/**
 * Generate a downloadable .docx from drafted message content using the
 * `docx` library. PDFs are produced in the browser (see app/utils/pdf.ts),
 * so no server-side converter is needed and this runs on serverless hosts.
 *
 * Body: { content: string, title?: string }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    content?: unknown
    title?: unknown
  }>(event)

  const content = typeof body.content === 'string' ? body.content : ''
  if (!content.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'content is required' })
  }

  const title = typeof body.title === 'string' && body.title.trim() ? body.title : deriveTitleFromContent(content)
  const filename = `${sanitizeFilename(title)}.docx`
  const docx = await buildDocx(content, title)

  setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
  setResponseHeader(event, 'Cache-Control', 'no-store')

  return docx
})
