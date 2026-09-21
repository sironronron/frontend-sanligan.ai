import type { ClientFilters, ClientInput } from '~/types/client'

/** UI-facing client operations; transport and response typing stay in Pinia. */
export function useClients() {
  const store = useClientStore()
  return {
    clients: store.clients,
    current: store.current,
    loading: store.loading,
    saving: store.saving,
    error: store.error,
    pagination: store.pagination,
    fetch: (filters?: ClientFilters) => store.fetchClients(filters),
    get: (id: string) => store.fetchClient(id),
    create: (payload: ClientInput) => store.createClient(payload),
    update: (id: string, payload: Partial<ClientInput>) => store.updateClient(id, payload),
    archive: (id: string) => store.archiveClient(id),
    restore: (id: string) => store.restoreClient(id),
  }
}
