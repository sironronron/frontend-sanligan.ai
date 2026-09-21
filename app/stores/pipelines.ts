import { defineStore } from 'pinia'
import type { Pipeline, PipelineInput, PipelineItem, PipelineItemInput, PipelinePagination, PipelineStage, StageHistoryEntry, StageInput } from '~/types/pipeline'

function idempotencyKey() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `crm-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
function statusOf(error: unknown) { return (error as { status?: number; statusCode?: number } | undefined)?.status ?? (error as { statusCode?: number } | undefined)?.statusCode }

export const usePipelineStore = defineStore('pipelines', () => {
  const api = useApi()
  const pipelines = ref<Pipeline[]>([])
  const items = ref<PipelineItem[]>([])
  const current = ref<Pipeline | null>(null)
  const loading = ref(false)
  const itemsLoading = ref(false)
  const saving = ref(false)
  const error = ref<unknown>(null)
  const itemsError = ref<unknown>(null)
  const etags = reactive<Record<string, string>>({})
  const pagination = ref<PipelinePagination>({ current_page: 1, last_page: 1, per_page: 100, total: 0 })

  function remember(resource: string, response: unknown) {
    const tag = (response as { headers?: { get?: (key: string) => string | null } } | undefined)?.headers?.get?.('etag')
    if (tag) etags[resource] = tag
  }
  function mutationOptions(resource: string, body?: unknown) {
    return { method: 'PATCH' as const, body, headers: { 'Idempotency-Key': idempotencyKey(), ...(etags[resource] ? { 'If-Match': etags[resource] } : {}) }, onResponse: ({ response }: { response: Response }) => remember(resource, response) }
  }
  async function fetchPipelines(archived = false) {
    loading.value = true; error.value = null
    try { const response = await api<{ data: Pipeline[]; meta?: Partial<PipelinePagination> }>(`/pipelines?per_page=100&archived=${archived ? 1 : 0}`); pipelines.value = response.data; pagination.value = { ...pagination.value, ...response.meta, total: response.meta?.total ?? response.data.length }; return response.data }
    catch (cause) { error.value = cause; pipelines.value = []; throw cause } finally { loading.value = false }
  }
  async function fetchPipeline(id: string) {
    const response = await api<{ data: Pipeline }>(`/pipelines/${encodeURIComponent(id)}`, { onResponse: ({ response }: { response: Response }) => remember(`pipeline:${id}`, response) }); current.value = response.data; return response.data
  }
  async function fetchItems(pipelineId: string, archived = false) {
    itemsLoading.value = true; itemsError.value = null
    try { const response = await api<{ data: PipelineItem[]; meta?: Partial<PipelinePagination> }>(`/pipeline-items?pipeline_id=${encodeURIComponent(pipelineId)}&per_page=100&archived=${archived ? 1 : 0}`); items.value = response.data; pagination.value = { ...pagination.value, ...response.meta, total: response.meta?.total ?? response.data.length }; return response.data }
    catch (cause) { itemsError.value = cause; items.value = []; throw cause } finally { itemsLoading.value = false }
  }
  async function createItem(payload: PipelineItemInput) { saving.value = true; try { const response = await api<{ data: PipelineItem }>('/pipeline-items', { method: 'POST', body: payload, headers: { 'Idempotency-Key': idempotencyKey() } }); return response.data } finally { saving.value = false } }
  async function updateItem(id: string, payload: Partial<PipelineItemInput>) { saving.value = true; try { const response = await api<{ data: PipelineItem }>(`/pipeline-items/${encodeURIComponent(id)}`, { ...mutationOptions(`item:${id}`, payload) }); return response.data } finally { saving.value = false } }
  async function moveItem(item: PipelineItem, stageId: string) { saving.value = true; try { const response = await api<{ data: PipelineItem }>(`/pipeline-items/${encodeURIComponent(item.id)}/stage`, { ...mutationOptions(`item:${item.id}`, { stage_id: stageId }) }); remember(`item:${item.id}`, response); return response.data } finally { saving.value = false } }
  async function fetchHistory(id: string) { const response = await api<{ data: StageHistoryEntry[] }>(`/pipeline-items/${encodeURIComponent(id)}/history?per_page=100`); return response.data }
  async function createPipeline(payload: PipelineInput) { saving.value = true; try { const response = await api<{ data: Pipeline }>('/pipelines', { method: 'POST', body: payload, headers: { 'Idempotency-Key': idempotencyKey() } }); return response.data } finally { saving.value = false } }
  async function updatePipeline(id: string, payload: PipelineInput) { saving.value = true; try { const response = await api<{ data: Pipeline }>(`/pipelines/${encodeURIComponent(id)}`, { ...mutationOptions(`pipeline:${id}`, payload) }); current.value = response.data; return response.data } finally { saving.value = false } }
  async function createStage(pipelineId: string, payload: StageInput) { saving.value = true; try { const response = await api<{ data: PipelineStage }>(`/pipelines/${encodeURIComponent(pipelineId)}/stages`, { method: 'POST', body: payload, headers: { 'Idempotency-Key': idempotencyKey() } }); return response.data } finally { saving.value = false } }
  async function updateStage(pipelineId: string, stageId: string, payload: StageInput) { saving.value = true; try { const response = await api<{ data: PipelineStage }>(`/pipelines/${encodeURIComponent(pipelineId)}/stages/${encodeURIComponent(stageId)}`, { ...mutationOptions(`stage:${stageId}`, payload) }); return response.data } finally { saving.value = false } }
  async function reorderStages(pipelineId: string, stageIds: string[]) { saving.value = true; try { const activeIds = current.value?.id === pipelineId ? current.value.stages.filter(stage => !stage.archived_at).sort((a, b) => a.position - b.position).map(stage => stage.id) : stageIds; const activeSet = new Set(activeIds); const orderedActiveIds = stageIds.filter(id => activeSet.has(id)); const response = await api<{ data: Pipeline }>(`/pipelines/${encodeURIComponent(pipelineId)}/stages/reorder`, { method: 'POST', body: { stage_ids: orderedActiveIds }, headers: { 'Idempotency-Key': idempotencyKey(), ...(etags[`pipeline:${pipelineId}`] ? { 'If-Match': etags[`pipeline:${pipelineId}`] } : {}) }, onResponse: ({ response: result }: { response: Response }) => remember(`pipeline:${pipelineId}`, result) }); current.value = response.data; return response.data } finally { saving.value = false } }
  async function archiveStage(pipelineId: string, stageId: string, replacementStageId?: string) { saving.value = true; try { const response = await api<{ data: PipelineStage }>(`/pipelines/${encodeURIComponent(pipelineId)}/stages/${encodeURIComponent(stageId)}`, { method: 'DELETE', body: replacementStageId ? { replacement_stage_id: replacementStageId } : undefined, headers: { 'Idempotency-Key': idempotencyKey(), ...(etags[`stage:${stageId}`] ? { 'If-Match': etags[`stage:${stageId}`] } : {}) } }); return response.data } finally { saving.value = false } }
  async function restoreStage(pipelineId: string, stageId: string) { saving.value = true; try { const response = await api<{ data: PipelineStage }>(`/pipelines/${encodeURIComponent(pipelineId)}/stages/${encodeURIComponent(stageId)}/restore`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey() } }); return response.data } finally { saving.value = false } }
  return { pipelines, items, current, loading, itemsLoading, saving, error, itemsError, pagination, fetchPipelines, fetchPipeline, fetchItems, createItem, updateItem, moveItem, fetchHistory, createPipeline, updatePipeline, createStage, updateStage, reorderStages, archiveStage, restoreStage, statusOf }
})
