/**
 * A short, human-friendly "X ago" label for a timestamp, matching the phrasing
 * used across the app ("3d ago", "5h ago"). Unknown or invalid dates return an
 * empty string so callers can render nothing.
 */
export function timeAgo(date: string | null | undefined): string {
  if (!date) return ''

  const then = new Date(date)
  if (Number.isNaN(then.getTime())) return ''

  const diffMs = Date.now() - then.getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`

  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}