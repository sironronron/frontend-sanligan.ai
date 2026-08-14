export interface ParsedTodo {
  title: string
  status?: string
}

/**
 * Recognize a TODO block marker on its own line. The canonical form is
 * [[TODO_START]] / [[TODO_END]], but the model occasionally wraps the markers
 * in markdown bold ("**[TODO_START]**"), drops to single brackets
 * ("[TODO_START]"), or prefixes them with a list dash ("-[TODO_END]"), so all
 * of those forms are matched.
 */
export const TODO_MARKER_PATTERN = /^[\s*_\-–—~]*\[{1,2}TODO_(START|END)\]{1,2}[\s*_\-–—~]*$/i

export function todoMarkerName(line: string): 'START' | 'END' | null {
  const match = line.trim().match(TODO_MARKER_PATTERN)
  if (!match) return null
  return match[1]!.toUpperCase() as 'START' | 'END'
}

/** Whether the text carries a TODO block marker in any of its tolerated forms. */
export function hasTodoMarker(text: string): boolean {
  return text.split(/\r?\n/).some((line) => todoMarkerName(line) !== null)
}

/** Remove TODO block markers (any tolerated form) from rendered text. */
export function stripTodoMarkers(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => todoMarkerName(line) === null)
    .join('\n')
}

export function sanitizeTodoTitle(title: string): string {
  // Strip bold/italic markdown wrapping
  let cleaned = title.replace(/^\*{1,2}(.+?)\*{1,2}$/, '$1')
  // Strip any remaining markdown artifacts
  cleaned = cleaned.replace(/[_*`]/g, '')
  return cleaned.trim()
}

/**
 * Whether the line closes the checklist and opens a new section, so trailing
 * prose is never mistaken for a to-do when the model omits the END marker.
 */
function startsNewSection(line: string): boolean {
  if (/^#{1,6}\s+/.test(line)) return true
  if (/^\*\*(?:sources?|next steps?|attachments?|enclosures?)\s*\*+:?\s*$/i.test(line)) return true
  if (line.startsWith('[Export') || line.includes('/export/')) return true
  return false
}

function parseTodoLine(line: string): ParsedTodo | null {
  const checkbox = line.match(/^[-*]?\s*(?:\*{0,2}\[_?\]\*{0,2}|\[( |x|X)\])\s+(.+)$/)
  if (checkbox) {
    const title = sanitizeTodoTitle(checkbox[2]!)
    if (!title) return null
    return { title, status: checkbox[1] && checkbox[1] !== ' ' ? 'completed' : 'pending' }
  }

  const bullet = line.match(/^[-*•]\s+(.+)$/)
  if (bullet) {
    const title = sanitizeTodoTitle(bullet[1]!)
    if (title) return { title }
  }

  const numbered = line.match(/^\d+[.)]\s+(.+)$/)
  if (numbered) {
    const title = sanitizeTodoTitle(numbered[1]!)
    if (title) return { title }
  }

  // Plain, unmarked lines: the model sometimes writes the checklist inside the
  // markers without any bullet at all. Accept sentence-length lines, but skip
  // intros such as "To proceed, do the following:".
  if (!line.endsWith(':')) {
    const title = sanitizeTodoTitle(line)
    if (title.length > 12 && title.includes(' ')) return { title }
  }

  return null
}

export function extractTodoItems(text: string): ParsedTodo[] {
  const items: ParsedTodo[] = []
  let sawMarker = false
  let inBlock = false

  // When the markers are present, parse only the block they bound: the
  // checklist contract calls for plain "- item" lines, so plain bullets and
  // numbered lines are items there, not chat noise.
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    const marker = todoMarkerName(trimmed)
    if (marker) {
      sawMarker = true
      if (marker === 'END') break
      inBlock = true
      continue
    }
    if (!inBlock || trimmed === '') continue
    if (startsNewSection(trimmed)) break

    const item = parseTodoLine(trimmed)
    if (item) items.push(item)
  }

  // No markers: keep the legacy behaviour of scanning the whole message for
  // checkbox items only, so older checkbox-style replies still create todos.
  if (!sawMarker) {
    const regex = /^\s*[-*]*\s*(?:\*{0,2}\[_?\]\*{0,2}|\[( |x|X)\])\s+(.+)$/gm
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      const title = sanitizeTodoTitle((match[2] ?? '').trim())
      if (title) {
        items.push({
          title,
          status: match[1] && match[1] !== ' ' ? 'completed' : 'pending',
        })
      }
    }
  }

  return items
}
