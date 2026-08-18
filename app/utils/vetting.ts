/** Option lists shared by the submitter request form. Mirrors config/vetting.php. */

export const VETTING_REGION_OPTIONS = [
  { value: 'nationwide', label: 'Nationwide' },
  { value: 'ncr', label: 'National Capital Region' },
  { value: 'region1', label: 'Region I – Ilocos' },
  { value: 'car', label: 'Cordillera Administrative Region' },
  { value: 'region2', label: 'Region II – Cagayan Valley' },
  { value: 'region3', label: 'Region III – Central Luzon' },
  { value: 'region4a', label: 'Region IV-A – CALABARZON' },
  { value: 'region4b', label: 'Region IV-B – MIMAROPA' },
  { value: 'region5', label: 'Region V – Bicol' },
  { value: 'region6', label: 'Region VI – Western Visayas' },
  { value: 'region7', label: 'Region VII – Central Visayas' },
  { value: 'region8', label: 'Region VIII – Eastern Visayas' },
  { value: 'region9', label: 'Region IX – Zamboanga Peninsula' },
  { value: 'region10', label: 'Region X – Northern Mindanao' },
  { value: 'region11', label: 'Region XI – Davao' },
  { value: 'region12', label: 'Region XII – SOCCSKSARGEN' },
  { value: 'caraga', label: 'Caraga' },
  { value: 'barmm', label: 'BARMM' },
] as const

export const VETTING_SERVICE_TYPES = [
  { value: 'notarization', label: 'Vetting + notarization', description: 'A lawyer reviews the document and notarizes it remotely.' },
  { value: 'vetting', label: 'Vetting only', description: 'A lawyer reviews the document for validity and issues.' },
] as const

export const VETTING_URGENCIES = [
  { value: 'normal', label: 'Normal', description: 'Standard turnaround.' },
  { value: 'urgent', label: 'Urgent', description: 'Prioritized for faster handling.' },
] as const

export const VETTING_DOCUMENT_TYPE_SUGGESTIONS = [
  'Deed of Sale',
  'Deed of Absolute Sale',
  'Contract to Sell',
  'Affidavit',
  'Special Power of Attorney',
  'Board Resolution',
  'Lease Agreement',
  'Loan Agreement',
  'Deed of Donation',
  'Extra-Judicial Settlement',
  'Contract of Lease',
  'Other',
] as const

export function regionLabel(value: string): string {
  return VETTING_REGION_OPTIONS.find((o) => o.value === value)?.label ?? value
}