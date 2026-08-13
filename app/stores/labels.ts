import { defineStore } from 'pinia'

export type LabelKind = 'document_category' | 'thread_tag'

export interface Label {
  id: string
  kind: LabelKind
  slug: string
  name: string
  description: string | null
  group: string | null
  color: string | null
  position: number
  /** Where the term comes from: seeded, shared by the firm, or the user's own. */
  scope: 'system' | 'organization' | 'personal'
  /** Whether the signed-in user may rename or delete it. */
  is_editable: boolean
  usage_count?: number
}

/** A label as it arrives attached to a document or a thread. */
export interface AppliedLabel extends Label {
  source?: 'user' | 'ai'
  confidence?: number | null
}

export interface LabelGroup {
  name: string
  labels: Label[]
}

/**
 * The shared label vocabulary: the case-file categories documents are filed
 * under and the tags threads carry. Both axes come from the same endpoint and
 * change rarely, so the list is fetched once and reused by every picker.
 */
export const useLabelStore = defineStore('labels', () => {
  const api = useApi()

  const labels = ref<Label[]>([])
  const loading = ref(false)
  const loaded = ref(false)

  let inFlight: Promise<void> | null = null

  const documentCategories = computed(() => labels.value.filter((label) => label.kind === 'document_category'))
  const threadTags = computed(() => labels.value.filter((label) => label.kind === 'thread_tag'))

  const byId = computed(() => new Map(labels.value.map((label) => [label.id, label])))

  /**
   * The labels of one kind, bucketed by their group so the picker can show
   * "Evidence" and "Pleadings & submissions" as headings. Custom terms carry
   * no group and collect under a trailing heading of their own.
   */
  function grouped(kind: LabelKind): LabelGroup[] {
    const groups: LabelGroup[] = []

    for (const label of labels.value.filter((item) => item.kind === kind)) {
      const name = label.group ?? 'Your labels'
      const existing = groups.find((group) => group.name === name)
      if (existing) existing.labels.push(label)
      else groups.push({ name, labels: [label] })
    }

    return groups
  }

  async function fetchLabels(force = false) {
    if (loaded.value && !force) return
    if (inFlight) return inFlight

    loading.value = true
    inFlight = (async () => {
      try {
        const { data } = await api<{ data: Label[] }>('/labels')
        labels.value = data
        loaded.value = true
      } finally {
        loading.value = false
        inFlight = null
      }
    })()

    return inFlight
  }

  async function createLabel(payload: { kind: LabelKind; name: string; description?: string }) {
    const { data } = await api<{ data: Label }>('/labels', {
      method: 'POST',
      body: payload,
    })
    labels.value = [...labels.value, data]
    return data
  }

  async function updateLabel(id: string, payload: { name?: string; description?: string | null }) {
    const { data } = await api<{ data: Label }>(`/labels/${id}`, {
      method: 'PATCH',
      body: payload,
    })
    const index = labels.value.findIndex((label) => label.id === id)
    if (index !== -1) labels.value[index] = { ...labels.value[index], ...data }
    return data
  }

  async function deleteLabel(id: string) {
    await api(`/labels/${id}`, { method: 'DELETE' })
    labels.value = labels.value.filter((label) => label.id !== id)
  }

  return {
    labels,
    loading,
    loaded,
    documentCategories,
    threadTags,
    byId,
    grouped,
    fetchLabels,
    createLabel,
    updateLabel,
    deleteLabel,
  }
})
