export const KYC_ROLE_OTHER = 'other'
export const KYC_USE_CASE_OTHER = 'other'

/**
 * Role and primary use are multi-select but capped: every selection injects a
 * full calibration fragment into every prompt, and past three those fragments
 * start pulling against each other — the profile stops narrowing anything and
 * becomes noise the model has to reconcile. Three still covers the real
 * combinations people have (lawyer + notary + business owner, research that is
 * also client work), which is the point of allowing more than one at all.
 *
 * Must stay in sync with UserProfile::MAX_ROLES / MAX_USE_CASES on the API.
 */
export const KYC_MAX_ROLES = 3
export const KYC_MAX_USE_CASES = 3

export interface KycOption {
  value: string
  label: string
}

export interface KycProfilePayload {
  kyc_role: string[]
  kyc_role_other?: string | null
  kyc_use_case: string[]
  kyc_use_case_other?: string | null
  kyc_document_types?: string[] | null
  kyc_experience_level?: string | null
}

/**
 * Role, primary use, and document types all come back as a comma-separated
 * list of keys. Splitting here keeps every caller off the string form.
 */
export function kycKeys(value: string | null | undefined): string[] {
  if (!value) return []
  return value.split(',').map(key => key.trim()).filter(Boolean)
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

/** Labels for every selected role, e.g. "Notary Public, Business Owner". */
export function kycRolesLabel(values: string | null | undefined): string {
  const keys = kycKeys(values)
  if (keys.length === 0) return 'Unspecified'
  return keys.map(kycRoleLabel).join(', ')
}

export function kycUseCasesLabel(values: string | null | undefined): string {
  const keys = kycKeys(values)
  if (keys.length === 0) return 'Unspecified'
  return keys.map(kycUseCaseLabel).join(', ')
}

export function kycDocumentTypeLabel(value: string): string {
  return kycDocumentTypeOptions.find((option) => option.value === value)?.label ?? value
}

export function kycDocumentTypesLabel(values: string | null | undefined): string {
  const keys = kycKeys(values)
  if (keys.length === 0) return 'Unspecified'
  return keys.map(kycDocumentTypeLabel).join(', ')
}

export function kycExperienceLevelLabel(value: string | null | undefined): string {
  return kycExperienceLevelOptions.find((option) => option.value === value)?.label ?? 'Unspecified'
}
