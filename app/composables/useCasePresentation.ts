/**
 * One source of truth for how a case renders.
 *
 * The list and the detail page each grew their own copies of the status
 * styles, the type labels and the date formatters, and the copies had already
 * drifted. Worse, every dark-mode variant collapsed to the same
 * `bg-cream/10 text-peach`, so at night a status badge and a priority badge
 * were indistinguishable — the two things a case list exists to signal.
 *
 * The fix is to give the two dimensions different *shapes* rather than
 * different shades:
 *   - status   — neutral bordered pill carrying a colored dot
 *   - priority — filled tint, and only when it is worth interrupting for
 *
 * Both read the same in light and dark because the chrome is token-driven and
 * only the dot changes color.
 */

export type CaseStatus = 'open' | 'in_progress' | 'on_hold' | 'closed'
export type CasePriority = 'low' | 'medium' | 'high' | 'urgent'

export const CASE_TYPE_LABELS: Record<string, string> = {
  legal: 'Legal',
  hr: 'HR',
  customer_support: 'Customer Support',
  administrative: 'Administrative',
  general: 'General',
}

export const CASE_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  closed: 'Closed',
}

export const CASE_PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
}

/** Neutral chrome for every status; the dot alone carries the meaning. */
const STATUS_DOT: Record<string, string> = {
  open: 'bg-primary',
  in_progress: 'bg-espresso dark:bg-peach',
  on_hold: 'bg-muted-foreground',
  closed: 'bg-muted-foreground/40',
}

/**
 * Filled, because priority is an interrupt. Low and medium are deliberately
 * quiet — a list where every row shouts has no signal left.
 */
const PRIORITY_CLASS: Record<string, string> = {
  low: 'border-transparent bg-muted text-muted-foreground',
  medium: 'border-transparent bg-muted text-muted-foreground',
  high: 'border-destructive/30 bg-destructive/10 text-destructive',
  urgent: 'border-transparent bg-destructive text-destructive-foreground',
}

export type DueTone = 'overdue' | 'soon' | 'normal'

export interface DueState {
  label: string
  tone: DueTone
  class: string
  days: number
}

const DUE_TONE_CLASS: Record<DueTone, string> = {
  overdue: 'text-destructive font-medium',
  soon: 'text-foreground font-medium',
  normal: 'text-muted-foreground',
}

export function useCasePresentation() {
  function humanize(value: string) {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  }

  function statusLabel(value: string) {
    return CASE_STATUS_LABELS[value] ?? humanize(value)
  }

  function priorityLabel(value: string) {
    return CASE_PRIORITY_LABELS[value] ?? humanize(value)
  }

  function typeLabel(value: string) {
    return CASE_TYPE_LABELS[value] ?? humanize(value)
  }

  function statusDotClass(value: string) {
    return STATUS_DOT[value] ?? 'bg-muted-foreground'
  }

  function priorityClass(value: string) {
    return PRIORITY_CLASS[value] ?? PRIORITY_CLASS.medium!
  }

  /** High and urgent earn a badge in a dense list; low and medium do not. */
  function isLoudPriority(value: string | null | undefined) {
    return value === 'high' || value === 'urgent'
  }

  function formatDate(value: string | null | undefined) {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function formatShortDate(value: string | null | undefined) {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  function formatDateTime(value: string | null | undefined) {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  }

  function relativeTime(value: string | null | undefined) {
    if (!value) return ''
    const then = new Date(value).getTime()
    if (Number.isNaN(then)) return ''
    const minutes = Math.floor((Date.now() - then) / 60000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return formatShortDate(value)
  }

  /**
   * A deadline is the one field on a case that changes meaning with the
   * calendar, so it gets read out in days rather than as a date the reader has
   * to subtract from today.
   */
  function dueState(value: string | null | undefined): DueState | null {
    if (!value) return null
    const due = new Date(value)
    if (Number.isNaN(due.getTime())) return null

    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const days = Math.round((startOfDay(due) - startOfDay(new Date())) / 86_400_000)

    let label: string
    let tone: DueTone

    if (days < 0) {
      tone = 'overdue'
      label = days === -1 ? 'Overdue by 1 day' : `Overdue by ${Math.abs(days)} days`
    } else if (days === 0) {
      tone = 'soon'
      label = 'Due today'
    } else if (days === 1) {
      tone = 'soon'
      label = 'Due tomorrow'
    } else if (days <= 7) {
      tone = 'soon'
      label = `Due in ${days} days`
    } else {
      tone = 'normal'
      label = `Due ${formatShortDate(value)}`
    }

    return { label, tone, class: DUE_TONE_CLASS[tone], days }
  }

  /** Share of a case's tasks already closed out, 0 when it has none. */
  function taskPercent(input: { open_tasks_count: number; total_tasks_count: number }) {
    if (!input.total_tasks_count) return 0
    return Math.round(((input.total_tasks_count - input.open_tasks_count) / input.total_tasks_count) * 100)
  }

  return {
    humanize,
    statusLabel,
    priorityLabel,
    typeLabel,
    statusDotClass,
    priorityClass,
    isLoudPriority,
    formatDate,
    formatShortDate,
    formatDateTime,
    relativeTime,
    dueState,
    taskPercent,
  }
}
