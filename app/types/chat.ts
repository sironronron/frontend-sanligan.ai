export interface ChatSource {
  type: 'legal' | 'document' | 'web'
  index?: number
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
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  provider?: string | null
  sources: ChatSource[]
  feedback?: string | null
  template_id?: string | null
  created_at: string
}

export interface ChatActivityStep {
  key: string
  label: string
  state: 'done' | 'active' | 'pending'
}
