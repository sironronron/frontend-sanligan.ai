import { useLocalStorage } from '@vueuse/core'

/**
 * How a list of things is drawn.
 *
 * - `list`  — one dense row each, the most detail per item.
 * - `card`  — a grid of tiles, easiest to scan by title.
 * - `table` — aligned columns, best for comparing dates and statuses.
 */
export type ViewMode = 'list' | 'card' | 'table'

export const VIEW_MODES: ViewMode[] = ['list', 'card', 'table']

/**
 * A view preference that survives a reload.
 *
 * Kept per screen rather than globally: someone who wants documents as a table
 * has not thereby said anything about how they want to read their drafts, and
 * one shared setting would keep overwriting the other.
 *
 * The app runs client-only (`ssr: false`), so reading localStorage up front is
 * safe and there is no hydration mismatch to guard against.
 */
export function useViewMode(key: string, fallback: ViewMode = 'list') {
  const mode = useLocalStorage<ViewMode>(`saligan-view-mode:${key}`, fallback)

  // A stored value from an older build, or one someone hand-edited, must not
  // leave the page rendering nothing.
  if (!VIEW_MODES.includes(mode.value)) mode.value = fallback

  return mode
}
