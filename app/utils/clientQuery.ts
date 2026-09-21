import type { ClientFilters } from '~/types/client'

export function buildClientQuery(filters: ClientFilters = {}): string {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '' && value !== null) {
      params.set(key, value === true ? '1' : value === false ? '0' : String(value))
    }
  }

  return params.toString()
}
