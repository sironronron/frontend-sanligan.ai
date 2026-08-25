export interface LegalCategory {
  value: string
  label: string
}

export type KnowledgeType = 'legal' | 'standard'

export const KNOWLEDGE_TYPES: { value: KnowledgeType; label: string }[] = [
  { value: 'legal', label: 'Philippine legal authority' },
  { value: 'standard', label: 'International standard' },
]

export const LEGAL_CATEGORIES: LegalCategory[] = [
  { value: 'law', label: 'Philippine Law' },
  { value: 'jurisprudence', label: 'Jurisprudence' },
  { value: 'issuance', label: 'Issuance' },
  { value: 'treaty', label: 'Treaty' },
  { value: 'general', label: 'General' },
  { value: 'standard', label: 'ISO / international standard' },
]

export function knowledgeTypeLabel(value: string | null | undefined): string {
  return KNOWLEDGE_TYPES.find((type) => type.value === value)?.label ?? 'Philippine legal authority'
}

export function categoryLabel(value: string | null | undefined): string {
  return LEGAL_CATEGORIES.find((c) => c.value === value)?.label ?? 'General'
}
