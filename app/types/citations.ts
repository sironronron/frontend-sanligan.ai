import type { ChatSource, ChatSourceTag } from '~/types/chat'

/**
 * One paragraph of a cited source. Chunks are the units retrieval cites, so
 * they double as the reader's paragraphs — that is what lets the popup
 * highlight exactly the passage an answer leaned on.
 */
export interface CitationChunk {
  id: string
  index: number
  content: string
}

/**
 * A card the panel has been asked to reveal, from a badge pressed in the
 * answer text. `at` carries the moment of the press so pressing the same badge
 * twice reveals it twice — a bare key would look unchanged and do nothing.
 */
export interface CitationTarget {
  key: string
  at: number
}

/** A cited source's full text, as the reader popup needs it. */
export interface CitationReading {
  kind: 'document' | 'legal'
  id: string
  title: string
  subtitle: string | null
  url: string | null
  digest: string | null
  hasDigest: boolean
  tags: ChatSourceTag[]
  uploadedAt: string | null
  chunks: CitationChunk[]
}

/**
 * A source as the panel shows it: one card per underlying document, page, or
 * page on the web, carrying every passage the thread cited it through.
 *
 * The thread is the unit, not the message — the same authority is routinely
 * cited by several answers in a row, and one card per citation would make the
 * panel mostly repetition.
 */
export interface CitationEntry {
  /** Stable per underlying source, so re-renders keep the card identity. */
  key: string
  type: ChatSource['type']
  /** The badge number shown inline in the answer text. */
  index: number
  token: string | null
  label: string
  title: string | null
  /** Every distinct passage the thread cited this source through. */
  excerpts: string[]
  citedChunkIndexes: number[]
  /** Set when the source can be read in-app. */
  readableId: string | null
  hasDigest: boolean
  url: string | null
  domain: string | null
  mimeType: string | null
  uploadedAt: string | null
  tags: ChatSourceTag[]
  sourceName: string | null
  lawName: string | null
  grNumber: string | null
  promulgationDate: string | null
}
