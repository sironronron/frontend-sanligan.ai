import type { Client } from '~/types/client'

export type PipelineOutcome = 'open' | 'won' | 'not_proceeding'

export interface PipelineStage {
  id: string
  name: string
  position: number
  outcome_kind: PipelineOutcome
  archived_at: string | null
}

export interface PipelineCapabilities { update?: boolean; archive?: boolean; restore?: boolean; configure_stages?: boolean }
export interface Pipeline {
  id: string
  name: string
  organization_id: string | null
  owner_id: string
  is_default: boolean
  archived_at: string | null
  stages: PipelineStage[]
  capabilities?: PipelineCapabilities
  created_at: string
  updated_at: string
}

export interface PipelineItem {
  id: string
  client_id: string
  pipeline_id: string
  stage_id: string
  owner_id: string
  title: string
  source: string | null
  note: string | null
  next_action_at: string | null
  archived_at: string | null
  client?: Pick<Client, 'id' | 'display_name' | 'client_type' | 'lifecycle'> | null
  pipeline?: Pick<Pipeline, 'id' | 'name'> | null
  stage?: PipelineStage | null
  owner?: { id: string; name: string } | null
  capabilities?: { update?: boolean; archive?: boolean; restore?: boolean; move?: boolean }
  created_at: string
  updated_at: string
}

export interface StageHistoryEntry {
  id: string
  previous_stage?: Pick<PipelineStage, 'id' | 'name'> | null
  new_stage?: Pick<PipelineStage, 'id' | 'name'> | null
  actor?: { id: string; name: string } | null
  created_at: string
}

export interface PipelineItemInput { client_id: string; pipeline_id: string; stage_id: string; title: string; source?: string | null; note?: string | null; next_action_at?: string | null }
export interface PipelineInput { name: string; description?: string | null }
export interface StageInput { name: string; outcome_kind: PipelineOutcome }
export interface PipelinePagination { current_page: number; last_page: number; per_page: number; total: number }
