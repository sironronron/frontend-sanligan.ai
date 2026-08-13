export interface LegalCategory {
  value: string
  label: string
}

export const LEGAL_CATEGORIES: LegalCategory[] = [
  { value: 'law', label: 'Philippine Law' },
  { value: 'jurisprudence', label: 'Jurisprudence' },
  { value: 'issuance', label: 'Issuance' },
  { value: 'treaty', label: 'Treaty' },
  { value: 'general', label: 'General' },
]

export function categoryLabel(value: string | null | undefined): string {
  return LEGAL_CATEGORIES.find((c) => c.value === value)?.label ?? 'General'
}