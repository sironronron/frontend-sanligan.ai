import type { LetterDraftPayload } from '~/types/tiptap'

/** A case-file category an uploaded document is filed under. */
export interface ChatSourceTag {
  id: string
  name: string
  color?: string | null
}

export interface ChatSource {
  type: 'legal' | 'document' | 'web'
  index?: number
  token?: string
  id?: string
  chunk_index?: number
  document_id?: string
  label?: string | null
  law_name?: string | null
  gr_number?: string | null
  promulgation_date?: string | null
  source_name?: string | null
  url?: string | null
  title?: string | null
  excerpt?: string
  domain?: string | null
  /** Set when the authority is in the knowledge base and can be read in-app. */
  page_id?: string | null
  has_digest?: boolean
  /** Chunk indices of that page the answer cited, for highlighting. */
  cited_chunk_indexes?: number[]
  /** Uploaded documents only — what kind of file it is, and how it is filed. */
  mime_type?: string | null
  uploaded_at?: string | null
  tags?: ChatSourceTag[]
}

/** A document the user attached to the message they sent. */
export interface ChatMessageAttachment {
  id: string
  title: string
  original_filename: string
  mime_type: string | null
  status: 'queued' | 'processing' | 'ready' | 'failed'
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  provider?: string | null
  sources: ChatSource[]
  attachments?: ChatMessageAttachment[]
  feedback?: string | null
  template_id?: string | null
  /** The Tiptap letter this turn drafted through `draft_letter`, if any. */
  letter_draft?: LetterDraftPayload | null
  /**
   * Claims the reply made about actions the turn never took — a search it did
   * not run, a task it did not write. Persisted with the message, so the
   * caveat is still there when the answer is read back weeks later.
   */
  tool_notices?: ChatToolNotice[]
  /**
   * How this answer was arrived at — the steps, the time taken, the sources
   * read. Persisted with the message so the "how this was worked out" line
   * under the reply survives the thread being re-fetched.
   */
  activity?: ChatTurnActivity | null
  created_at: string
}

/** The persisted account of how one assistant turn was produced. */
export interface ChatTurnActivity {
  steps: { key: string, label: string }[]
  duration_ms: number
  web_sources: number
}

/**
 * Confirmation that a tool actually wrote something, shown under the answer
 * that triggered it.
 *
 * Tasks and flags land in side panels the reader may not have open, so without
 * this the only evidence a turn did anything is the reply's own claim that it
 * did — which is exactly the claim that cannot be trusted on its own.
 */
export interface ChatToolReceipt {
  kind: 'tasks' | 'advisories'
  count: number
}

/** A correction shown with an assistant message; see `ToolClaimGuard`. */
export interface ChatToolNotice {
  kind: string
  message: string
}

/** One site the delegated web search read, as it is being read. */
export interface ChatWebSource {
  url: string
  domain: string | null
  title: string | null
  /** The citation card number this source became, once it has one. */
  index: number | null
}

/**
 * The live web search, held only while it runs. Cleared on `done` — these are
 * the sites being consulted, not the sources the answer ended up citing, and
 * leaving them on screen under a finished answer would conflate the two.
 */
export interface ChatWebSearch {
  query: string
  sources: ChatWebSource[]
  /** `read` means every row has been fetched and named. */
  phase: 'start' | 'reading' | 'read' | 'done'
}

export interface ChatActivityStep {
  key: string
  label: string
  state: 'done' | 'active' | 'pending'
}
