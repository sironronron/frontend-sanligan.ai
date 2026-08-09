import { getRequestHeaders, setResponseHeader, type H3Event } from 'h3'
import { buildDocx } from '../../utils/docx'
import { deriveTitleFromContent, sanitizeFilename } from '../../utils/document'

/**
 * Generate a downloadable .docx from drafted message content using the
 * `docx` library. PDFs are produced in the browser (see app/utils/pdf.ts),
 * so no server-side converter is needed and this runs on serverless hosts.
 *
 * Body: { content: string, title?: string }
 *
 * The endpoint has no authentication of its own, so it is locked down with an
 * origin allow-list (cross-site callers are rejected) and a per-IP burst
 * guard so it cannot be abused as an open CPU/RAM sink. Set
 * NUXT_ALLOWED_ORIGINS to the app's own origin(s) in production.
 */

const MAX_CONTENT_LENGTH = 200_000

const LOCAL_HOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/

const RATE_WINDOW_MS = 60_000
const RATE_MAX = 20
const buckets = new Map<string, { count: number; resetAt: number }>()

function isAllowedOrigin(origin: string | null | undefined, allowedOrigins: string): boolean {
  if (!origin) return false
  if (LOCAL_HOST_PATTERN.test(origin)) return true
  return allowedOrigins
    .split(',')
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .includes(origin)
}

function clientIp(event: H3Event): string {
  const headers = getRequestHeaders(event)
  const forwarded = headers['x-forwarded-for']?.split(',')[0]?.trim()
  return forwarded || headers['cf-connecting-ip'] || (event.node.req.socket?.remoteAddress ?? 'unknown')
}

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const bucket = buckets.get(ip)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }
  bucket.count += 1
  return bucket.count > RATE_MAX
}

export default defineEventHandler(async (event) => {
  const { allowedOrigins } = useRuntimeConfig(event)
  const origin = getRequestHeaders(event).origin

  if (!isAllowedOrigin(origin, allowedOrigins)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  if (rateLimited(clientIp(event))) {
    throw createError({ statusCode: 429, statusMessage: 'Too Many Requests' })
  }

  const body = await readBody<{
    content?: unknown
    title?: unknown
  }>(event)

  const content = typeof body.content === 'string' ? body.content : ''
  if (!content.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'content is required' })
  }

  if (content.length > MAX_CONTENT_LENGTH) {
    throw createError({ statusCode: 413, statusMessage: 'content is too large' })
  }

  const title = typeof body.title === 'string' && body.title.trim() ? body.title : deriveTitleFromContent(content)
  const filename = `${sanitizeFilename(title)}.docx`
  const docx = await buildDocx(content, title)

  setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')

  return docx
})
