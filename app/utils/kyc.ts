export const KYC_ROLE_OTHER = 'other'
export const KYC_USE_CASE_OTHER = 'other'

export interface KycOption {
  value: string
  label: string
}

export interface KycProfilePayload {
  kyc_role: string
  kyc_role_other?: string | null
  kyc_use_case: string
  kyc_use_case_other?: string | null
  kyc_document_types?: string[] | null
  kyc_experience_level?: string | null
}

export const kycRoleOptions: KycOption[] = [
  { value: 'private_individual', label: 'Private Individual / Ordinary Citizen' },
  { value: 'lawyer', label: 'Lawyer / Legal Counsel' },
  { value: 'paralegal', label: 'Paralegal / Law Firm Staff' },
  { value: 'government_employee', label: 'Government Employee (LGU, DAR, DENR, etc.)' },
  { value: 'real_estate_broker', label: 'Real Estate Broker / Property Manager' },
  { value: 'farmer', label: 'Farmer / Agrarian Reform Beneficiary / Cooperative Officer' },
  { value: 'business_owner', label: 'Business Owner / Entrepreneur' },
  { value: 'law_student', label: 'Law Student / Bar Reviewee' },
  { value: 'notary_public', label: 'Notary Public' },
  { value: KYC_ROLE_OTHER, label: 'Other' },
]

export const kycUseCaseOptions: KycOption[] = [
  { value: 'personal_dispute', label: "A personal dispute or legal issue I'm involved in" },
  { value: 'own_transaction', label: 'Drafting documents for my own transaction' },
  { value: 'client_work', label: 'Preparing documents/research for clients (professional use)' },
  { value: 'legal_research', label: 'Legal research' },
  { value: 'government_transaction', label: 'Government transaction assistance (permits, certifications, appeals)' },
  { value: 'agrarian_land', label: 'Agrarian or land ownership matters' },
  { value: 'learning', label: 'Learning about Philippine law' },
  { value: KYC_USE_CASE_OTHER, label: 'Other' },
]

export const kycDocumentTypeOptions: KycOption[] = [
  { value: 'demand_letter', label: 'Demand Letter / Formal Letter' },
  { value: 'contract', label: 'Contract / Agreement' },
  { value: 'deed', label: 'Deed (Sale, Donation, Assignment)' },
  { value: 'affidavit', label: 'Affidavit / Sworn Statement' },
  { value: 'government_letter', label: 'Government Transaction Letter' },
  { value: 'complaint', label: 'Complaint / Pleading' },
  { value: 'power_of_attorney', label: 'Power of Attorney' },
  { value: 'lease', label: 'Lease / Tenancy Agreement' },
  { value: 'other_doc', label: 'Other' },
]

export const kycExperienceLevelOptions: KycOption[] = [
  { value: 'beginner', label: 'Beginner — I need step-by-step guidance' },
  { value: 'intermediate', label: 'Intermediate — I know the basics' },
  { value: 'experienced', label: 'Experienced — I know what I need' },
  { value: 'professional', label: 'Professional — I draft documents regularly' },
]

export function kycRoleLabel(value: string | null | undefined): string {
  return kycRoleOptions.find((option) => option.value === value)?.label ?? 'Unspecified'
}

export function kycUseCaseLabel(value: string | null | undefined): string {
  return kycUseCaseOptions.find((option) => option.value === value)?.label ?? 'Unspecified'
}

export function kycDocumentTypeLabel(value: string): string {
  return kycDocumentTypeOptions.find((option) => option.value === value)?.label ?? value
}

export function kycDocumentTypesLabel(values: string | null | undefined): string {
  if (!values) return 'Unspecified'
  return values.split(',').map((v) => kycDocumentTypeLabel(v.trim())).join(', ')
}

export function kycExperienceLevelLabel(value: string | null | undefined): string {
  return kycExperienceLevelOptions.find((option) => option.value === value)?.label ?? 'Unspecified'
}
