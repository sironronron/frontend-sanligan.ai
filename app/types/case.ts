/** Shapes shared between the case page and the panels it hands data to. */

import type { AppliedLabel } from '~/stores/labels'

export interface CaseDocument {
  id: string
  case_id: string | null
  title: string
  original_filename: string
  mime_type: string
  status: 'queued' | 'processing' | 'ready' | 'failed'
  error_message: string | null
  chunk_count: number
  /** The document categories the case sidebar groups files under. */
  categories: AppliedLabel[]
  created_at: string
}

export interface GeneratedDocument {
  id: string
  conversation_id: string
  conversation_title: string | null
  title: string
  content: string
  created_at: string
}

export const DOCUMENT_STATUS_LABEL: Record<CaseDocument['status'], string> = {
  queued: 'Queued',
  processing: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
}
