import type { CitationChunk, CitationEntry, CitationReading } from '~/types/citations'
import type { ChatSourceTag } from '~/types/chat'

interface DocumentContentResponse {
  data: {
    id: string
    title: string | null
    original_filename: string
    mime_type: string | null
    digest: string | null
    has_digest: boolean
    categories?: ChatSourceTag[]
    uploaded_at: string | null
    chunks: CitationChunk[]
  }
}

interface LegalPageResponse {
  data: {
    id: string
    title: string | null
    law_name: string | null
    gr_number: string | null
    promulgation_date: string | null
    url: string | null
    source_name: string | null
    knowledge_type: string | null
    standard_code: string | null
    standard_edition: string | null
    standard_issuer: string | null
    standard_status: string | null
    standard_publication_date: string | null
    standard_review_date: string | null
    rights_basis: string | null
    digest: string | null
    has_digest: boolean
    chunks: CitationChunk[]
  }
}

interface WebPageResponse {
  data: {
    url: string
    title: string | null
    digest: string | null
    has_digest: boolean
    chunks: CitationChunk[]
    cited_chunk_indexes: number[]
  }
}

/** Sent instead of a page while a scanned PDF is still being read with OCR. */
interface WebPageProcessing {
  status: 'processing'
  message?: string
  retry_after?: number
}

/** A scan can take a minute or more to recognise; give up well after that. */
const MAX_WAIT_MS = 4 * 60 * 1000
const DEFAULT_RETRY_SECONDS = 5

/**
 * Full texts already fetched, kept for the life of the tab.
 *
 * Reading a source is a normal back-and-forth — open the digest, read the
 * passage, close, open the next citation, come back — and these documents do
 * not change under the reader, so refetching on every open would only add a
 * spinner to a document the tab already holds.
 */
const cache = new Map<string, CitationReading>()

export function useCitationReader() {
  const api = useApi()

  const reading = ref<CitationReading | null>(null)
  /** Which of the two buttons opened the popup. */
  const view = ref<'digest' | 'full'>('full')
  const highlight = ref<number[]>([])
  const loading = ref(false)
  const error = ref('')
  /** What is happening while a slow source is opened, e.g. a scan being read. */
  const note = ref('')
  /** Bumped when a reading starts or is closed, so a stale poll stops itself. */
  let generation = 0

  const open = computed(() => reading.value !== null || loading.value)

  async function load(entry: CitationEntry, run: number): Promise<CitationReading | null> {
    if (entry.readableId === null) return null

    // A web page's cited passages depend on the snippets this thread cited it
    // through, so they are part of what identifies the cached reading.
    const key = entry.type === 'web'
      ? `web:${entry.readableId}:${entry.excerpts.join('|')}`
      : `${entry.type}:${entry.readableId}`
    const cached = cache.get(key)
    if (cached) return cached

    if (entry.type === 'web') {
      const data = await loadWebPage(entry, run)

      if (data === null) return null

      const resolved: CitationReading = {
        kind: 'web',
        id: data.url,
        title: data.title || entry.label,
        subtitle: entry.domain,
        url: data.url,
        digest: data.digest,
        hasDigest: data.has_digest,
        tags: [],
        uploadedAt: null,
        standard_code: null,
        standard_edition: null,
        standard_issuer: null,
        standard_status: null,
        standard_publication_date: null,
        standard_review_date: null,
        rights_basis: null,
        chunks: data.chunks ?? [],
        citedChunkIndexes: data.cited_chunk_indexes ?? [],
      }

      cache.set(key, resolved)
      return resolved
    }

    if (entry.type === 'document') {
      const { data } = await api<DocumentContentResponse>(`/documents/${entry.readableId}/content`)

      const resolved: CitationReading = {
        kind: 'document',
        id: data.id,
        title: data.title || data.original_filename,
        subtitle: data.original_filename,
        url: null,
        digest: data.digest,
        hasDigest: data.has_digest,
        tags: data.categories ?? [],
        uploadedAt: data.uploaded_at,
        standard_code: null,
        standard_edition: null,
        standard_issuer: null,
        standard_status: null,
        standard_publication_date: null,
        standard_review_date: null,
        rights_basis: null,
        chunks: data.chunks ?? [],
      }

      cache.set(key, resolved)
      return resolved
    }

    const { data } = await api<LegalPageResponse>(`/legal-pages/${entry.readableId}`)

    const isStandard = data.knowledge_type === 'standard'
    const resolved: CitationReading = isStandard
      ? {
          kind: 'standard',
          id: data.id,
          title: data.standard_code || data.title || data.source_name || 'International standard',
          subtitle: [
            data.standard_edition ? `Edition ${data.standard_edition}` : null,
            data.standard_issuer,
            data.standard_status,
            data.source_name,
          ].filter(Boolean).join(' · ') || null,
          url: data.url,
          digest: data.digest,
          hasDigest: data.has_digest,
          tags: [],
          uploadedAt: null,
          standard_code: data.standard_code,
          standard_edition: data.standard_edition,
          standard_issuer: data.standard_issuer,
          standard_status: data.standard_status,
          standard_publication_date: data.standard_publication_date,
          standard_review_date: data.standard_review_date,
          rights_basis: data.rights_basis,
          chunks: data.chunks ?? [],
        }
      : {
          kind: 'legal',
          id: data.id,
          title: data.law_name || data.title || data.gr_number || 'Legal source',
          subtitle: [data.gr_number, data.source_name].filter(Boolean).join(' · ') || null,
          url: data.url,
          digest: data.digest,
          hasDigest: data.has_digest,
          tags: [],
          uploadedAt: null,
          standard_code: null,
          standard_edition: null,
          standard_issuer: null,
          standard_status: null,
          standard_publication_date: null,
          standard_review_date: null,
          rights_basis: null,
          chunks: data.chunks ?? [],
        }

    cache.set(key, resolved)
    return resolved
  }

  /**
   * Ask for a web page until it is ready. The API answers at once for a normal
   * page; for a scanned PDF it starts OCR and says "processing" until the text
   * exists, so the reader asks again instead of holding one request open.
   * Returns null if the reader was closed while waiting.
   */
  async function loadWebPage(entry: CitationEntry, run: number): Promise<WebPageResponse['data'] | null> {
    const startedAt = Date.now()

    while (run === generation) {
      const response = await api<WebPageResponse | WebPageProcessing>('/web-pages/read', {
        method: 'POST',
        body: { url: entry.readableId, snippets: entry.excerpts },
      })

      if (!('status' in response)) return response.data

      note.value = response.message ?? 'Reading this scanned PDF…'

      if (Date.now() - startedAt > MAX_WAIT_MS) {
        throw new Error('Timed out waiting for the scanned PDF to be read.')
      }

      await new Promise((resolve) => setTimeout(resolve, (response.retry_after ?? DEFAULT_RETRY_SECONDS) * 1000))
    }

    return null
  }

  /**
   * Open the reader on a citation. `mode` is which of the card's two buttons
   * was pressed; either way the whole text is fetched, so switching tabs
   * inside the popup costs nothing.
   */
  async function read(entry: CitationEntry, mode: 'digest' | 'full'): Promise<void> {
    if (entry.readableId === null) return

    const run = ++generation

    view.value = mode
    highlight.value = entry.citedChunkIndexes
    error.value = ''
    note.value = ''
    loading.value = true
    reading.value = null

    try {
      const resolved = await load(entry, run)

      // Closed (or another source opened) while this one was still loading.
      if (run !== generation) return

      if (resolved === null) {
        error.value = 'This source cannot be opened here.'
        return
      }

      reading.value = resolved
      if (resolved.citedChunkIndexes !== undefined) highlight.value = resolved.citedChunkIndexes

      // A digest is generated on first read and may simply not exist for an
      // older or too-fragmentary source; fall back rather than show a blank tab.
      if (mode === 'digest' && !resolved.hasDigest) view.value = 'full'
    } catch (caught) {
      if (run !== generation) return

      // The API says why a web page could not be read (a scan, a script-only
      // page, an unreachable site) in words meant for the reader.
      const reason = (caught as { data?: { message?: unknown } })?.data?.message

      error.value = entry.type === 'web'
        ? (typeof reason === 'string' && reason !== '' ? reason : 'This page could not be read here. Use Go to link to open the original.')
        : 'Could not open this source.'
    } finally {
      if (run === generation) {
        loading.value = false
        note.value = ''
      }
    }
  }

  function close(): void {
    generation++
    note.value = ''
    reading.value = null
    highlight.value = []
    error.value = ''
    loading.value = false
  }

  return { reading, view, highlight, loading, error, note, open, read, close }
}
