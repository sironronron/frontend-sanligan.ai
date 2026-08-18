/** API shapes for the lawyer document-vetting marketplace. */

export interface VettingRequestRecord {
  id: string
  document_type: string
  summary: string
  jurisdiction: string
  service_type: 'vetting' | 'notarization'
  service_type_label: string
  urgency: 'normal' | 'urgent'
  urgency_label: string
  status:
    | 'payment_pending'
    | 'pending'
    | 'matched'
    | 'waiting'
    | 'accepted'
    | 'under_review'
    | 'vetted'
    | 'notarized'
    | 'completed'
    | 'cancelled'
    | 'declined'
  status_label: string
  vetting_fee: number
  notarization_fee: number
  property_value: number | null
  processing_fee: number | null
  total_fee: number
  payment_status: string
  gateway_checkout_url: string | null
  deadline_at: string | null
  locked_at: string | null
  session_scheduled_at: string | null
  session_link: string | null
  session_provider: string | null
  certificate_number: string | null
  completed_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  created_at: string
  updated_at: string
  submitter: { id: string, name: string } | null
  assigned_lawyer: { id: string, name: string } | null
  document: { id: string, title: string, original_filename: string } | null
  /** How this lawyer relates to the request, when they have a match row. */
  my_match: string | null
  my_match_label: string | null
}

export interface VettingMessage {
  id: string
  vetting_request_id: string
  author: { id: string, name: string } | null
  body: string
  created_at: string
}

export interface LawyerProfileData {
  id: string
  user_id: string
  full_name: string
  bar_number: string
  bar_jurisdiction: string
  ptr_number: string | null
  practice_areas: string[]
  region: string
  city: string | null
  phone: string | null
  is_notary: boolean
  can_notarize: boolean
  notarial_commission_number: string | null
  notarial_commission_issuer: string | null
  notarial_commission_expires_at: string | null
  verification_status: 'pending' | 'verified' | 'rejected'
  verification_reason: string | null
  verification_reviewed_at: string | null
  verified_at: string | null
  available: boolean
  max_concurrent_assignments: number
  notify_email: boolean
  notify_sms: boolean
  notify_push: boolean
  notify_in_app: boolean
  profile_changed_at: string | null
  has_id_document: boolean
  has_bar_membership_document: boolean
  created_at: string
  updated_at: string
  user?: { id: string, name: string, email: string, created_at: string } | null
}

export interface LawyerProfileResponse {
  data: LawyerProfileData | null
  meta: {
    practice_area_options: { value: string, label: string, documents: string[] }[]
    region_options: { value: string, label: string }[]
    commission_required: boolean
  }
}

export interface JournalEntry {
  id: string
  lawyer_id: number
  vetting_request_id: string
  signer_name: string
  id_type: string
  id_number: string
  document_type: string
  verification_method: string | null
  certificate_number: string
  session_recording_ref: string | null
  notarized_at: string
  created_at: string
}
