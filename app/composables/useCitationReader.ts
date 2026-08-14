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
    digest: string | null
    has_digest: boolean
    chunks: CitationChunk[]
  }
}

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

  const open = computed(() => reading.value !== null || loading.value)

  async function load(entry: CitationEntry): Promise<CitationReading | null> {
    if (entry.readableId === null) return null

    const key = `${entry.type}:${entry.readableId}`
    const cached = cache.get(key)
    if (cached) return cached

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
        chunks: data.chunks ?? [],
      }

      cache.set(key, resolved)
      return resolved
    }

    const { data } = await api<LegalPageResponse>(`/legal-pages/${entry.readableId}`)

    const resolved: CitationReading = {
      kind: 'legal',
      id: data.id,
      title: data.law_name || data.title || data.gr_number || 'Legal source',
      subtitle: [data.gr_number, data.source_name].filter(Boolean).join(' · ') || null,
      url: data.url,
      digest: data.digest,
      hasDigest: data.has_digest,
      tags: [],
      uploadedAt: null,
      chunks: data.chunks ?? [],
    }

    cache.set(key, resolved)
    return resolved
  }

  /**
   * Open the reader on a citation. `mode` is which of the card's two buttons
   * was pressed; either way the whole text is fetched, so switching tabs
   * inside the popup costs nothing.
   */
  async function read(entry: CitationEntry, mode: 'digest' | 'full'): Promise<void> {
    if (entry.readableId === null) return

    view.value = mode
    highlight.value = entry.citedChunkIndexes
    error.value = ''
    loading.value = true
    reading.value = null

    try {
      const resolved = await load(entry)

      if (resolved === null) {
        error.value = 'This source cannot be opened here.'
        return
      }

      reading.value = resolved

      // A digest is generated on first read and may simply not exist for an
      // older or too-fragmentary source; fall back rather than show a blank tab.
      if (mode === 'digest' && !resolved.hasDigest) view.value = 'full'
    } catch {
      error.value = 'Could not open this source.'
    } finally {
      loading.value = false
    }
  }

  function close(): void {
    reading.value = null
    highlight.value = []
    error.value = ''
    loading.value = false
  }

  return { reading, view, highlight, loading, error, open, read, close }
}
