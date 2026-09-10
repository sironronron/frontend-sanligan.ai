export interface DashboardUsageMeter {
  used: number
  limit: number | null
}

export interface DashboardAiUsageMeter {
  used_pesos: number
  budget_pesos: number
  percent: number
  warning: boolean
  exhausted: boolean
  warned_80_at: string | null
  window_start: string | null
  window_end: string | null
}

export interface DashboardSummary {
  usage: {
    ai_usage: DashboardAiUsageMeter
    messages: DashboardUsageMeter
    documents: DashboardUsageMeter
    active_cases: DashboardUsageMeter
  }
  cases: {
    total: number
    open: number
  }
  organization: {
    members: number
    seats_used: number
    seats_total: number
  }
  tasks: {
    open: number
    pending: number
    on_going: number
    completed: number
  }
  drafts: {
    total: number
    recent: Array<{
      message_id: string
      title: string
      created_at: string
    }>
  }
  vetting: {
    active: number
    by_status: Record<string, number>
  }
}
