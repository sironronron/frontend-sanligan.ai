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
  created_at: string
}

export interface ChatActivityStep {
  key: string
  label: string
  state: 'done' | 'active' | 'pending'
}
