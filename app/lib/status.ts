/**
 * One semantic map for every status pill in the app.
 *
 * Cases, todos, vetting, billing, and admin each used to hand-roll their own
 * `statusTone`/`statusColor` map — so a "completed" task and a "verified"
 * lawyer reviewed in four different shades, and dark mode collapsed several to
 * the same tint. This is the single source of truth `StatusBadge` consumes.
 *
 * A tone is deliberately coarse: success / warning / danger / info / pending /
 * neutral. Anything finer (which exact green) is a CSS-class decision made once
 * here, in token colors, so it renders correctly in both themes.
 */
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'pending' | 'neutral'

const TONE_CLASS: Record<StatusTone, string> = {
  success: 'border-primary/25 bg-primary/10 text-primary',
  info: 'border-primary/25 bg-primary/10 text-primary',
  warning: 'border-warning/30 bg-warning/12 text-warning',
  danger: 'border-destructive/30 bg-destructive/10 text-destructive',
  pending: 'border-border bg-muted text-muted-foreground',
  neutral: 'border-border bg-muted text-muted-foreground',
}

export function statusToneClass(tone: StatusTone): string {
  return TONE_CLASS[tone] ?? TONE_CLASS.neutral
}

/** Lower-case status strings used across the product → semantic tone. */
const STATUS_TONE: Record<string, StatusTone> = {
  // cases
  open: 'info',
  in_progress: 'warning',
  on_hold: 'neutral',
  closed: 'neutral',
  // todos
  pending: 'pending',
  on_going: 'warning',
  completed: 'success',
  // vetting / lawyer
  matched: 'info',
  accepted: 'info',
  under_review: 'warning',
  vetted: 'success',
  notarized: 'success',
  scheduled: 'info',
  submitted: 'pending',
  awaiting_payment: 'warning',
  payment_pending: 'warning',
  waiting: 'pending',
  in_review: 'warning',
  offered: 'info',
  declined: 'danger',
  cancelled: 'neutral',
  expired: 'neutral',
  // billing / subscription
  active: 'success',
  paid: 'success',
  failed: 'danger',
  trialing: 'info',
  // profiles
  verified: 'success',
  pending_verification: 'pending',
  rejected: 'danger',
}

export function statusTone(status: string): StatusTone {
  return STATUS_TONE[status] ?? 'neutral'
}
