export interface IsoStandard {
  code: string
  label: string
  issuers: string[]
  reference_url: string
}

export const ISO_STANDARDS: IsoStandard[] = [
  {
    code: 'ISO 9001',
    label: 'Quality management systems — Requirements',
    issuers: ['ISO'],
    reference_url: 'https://www.iso.org/standard/62085.html',
  },
  {
    code: 'ISO/IEC 27001',
    label: 'Information security, cybersecurity and privacy protection — Information security management systems — Requirements',
    issuers: ['ISO', 'IEC'],
    reference_url: 'https://www.iso.org/standard/82875.html',
  },
  {
    code: 'ISO 14001',
    label: 'Environmental management systems — Requirements with guidance for use',
    issuers: ['ISO'],
    reference_url: 'https://www.iso.org/standard/60857.html',
  },
  {
    code: 'ISO 45001',
    label: 'Occupational health and safety management systems — Requirements with guidance for use',
    issuers: ['ISO'],
    reference_url: 'https://www.iso.org/standard/63787.html',
  },
  {
    code: 'ISO 31000',
    label: 'Risk management — Guidelines',
    issuers: ['ISO'],
    reference_url: 'https://www.iso.org/standard/65694.html',
  },
  {
    code: 'ISO 37301',
    label: 'Compliance management systems — Requirements with guidance for use',
    issuers: ['ISO'],
    reference_url: 'https://www.iso.org/standard/75080.html',
  },
  {
    code: 'ISO 20022',
    label: 'Financial services — Universal financial industry message scheme',
    issuers: ['ISO'],
    reference_url: 'https://www.iso.org/standard/20022-1',
  },
  {
    code: 'ISO 8583',
    label: 'Financial-transaction-card-originated messages — Interchange message specifications',
    issuers: ['ISO'],
    reference_url: 'https://www.iso.org/standard/79451.html',
  },
  {
    code: 'ISO 9362',
    label: 'Banking — Banking telecommunication messages — Business identifier code (BIC)',
    issuers: ['ISO'],
    reference_url: 'https://www.iso.org/standard/60390.html',
  },
  {
    code: 'ISO 4217',
    label: 'Codes for the representation of currencies',
    issuers: ['ISO'],
    reference_url: 'https://www.iso.org/standard/64758.html',
  },
  {
    code: 'ISO 17442',
    label: 'Financial services — Legal Entity Identifier (LEI)',
    issuers: ['ISO'],
    reference_url: 'https://www.iso.org/standard/59771.html',
  },
]

export type StandardStatus = 'current' | 'withdrawn' | 'draft' | 'informational'

export const STANDARD_STATUSES: { value: StandardStatus; label: string }[] = [
  { value: 'current', label: 'Current' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'draft', label: 'Draft' },
  { value: 'informational', label: 'Informational' },
]

export type RightsBasis = 'licensed_copy' | 'public_summary'

export const STANDARD_RIGHTS_BASES: { value: RightsBasis; label: string }[] = [
  { value: 'licensed_copy', label: 'Licensed copy' },
  { value: 'public_summary', label: 'Public summary or excerpt' },
]

export function standardStatusLabel(value: string | null | undefined): string {
  return STANDARD_STATUSES.find((status) => status.value === value)?.label ?? value ?? '—'
}

export function rightsBasisLabel(value: string | null | undefined): string {
  return STANDARD_RIGHTS_BASES.find((basis) => basis.value === value)?.label ?? value ?? '—'
}
