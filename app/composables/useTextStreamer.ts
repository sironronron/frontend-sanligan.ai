/**
 * Smooths SSE text deltas into a character-by-character reveal.
 *
 * The providers do not stream one character at a time — Anthropic and Gemini
 * emit chunks of several words, and a tool round-trip can land a whole
 * paragraph in a single frame. Appending each delta straight onto the message
 * therefore makes the answer arrive in visible jumps.
 *
 * Deltas are queued here instead and drained on an animation frame. The drain
 * is proportional to the backlog, with a per-frame ceiling: a slow provider
 * reveals a few characters per frame, while a large one-shot provider chunk
 * remains visibly incremental instead of appearing as a whole paragraph.
 */

/** The backlog is normally spread over roughly this many frames. */
const SMOOTHING = 10
/** Keep even a one-shot final provider chunk visibly incremental. */
const MAX_CHARS_PER_FRAME = 8

export interface TextStreamer {
  /** Queue a delta for reveal. */
  push(text: string): void
  /** Resolve once all queued text has been revealed naturally. */
  drained(): Promise<void>
  /** Reveal everything still queued immediately, and stop the loop. */
  flush(): void
  /** Drop anything still queued and stop the loop. */
  stop(): void
}

export function createTextStreamer(append: (chunk: string) => void): TextStreamer {
  // Server-rendered passes and reduced-motion users get the text with no
  // animation at all: the reveal is decoration, never a gate on the content.
  const immediate =
    typeof window === 'undefined' ||
    typeof window.requestAnimationFrame !== 'function' ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

  let queue = ''
  let frame = 0
  let drainWaiters: Array<() => void> = []

  const resolveDrained = () => {
    if (queue !== '' || frame !== 0 || drainWaiters.length === 0) return

    const waiters = drainWaiters
    drainWaiters = []
    for (const resolve of waiters) resolve()
  }

  const tick = () => {
    frame = 0

    if (queue === '') {
      resolveDrained()
      return
    }

    const size = Math.max(1, Math.min(Math.ceil(queue.length / SMOOTHING), MAX_CHARS_PER_FRAME))

    append(queue.slice(0, size))
    queue = queue.slice(size)

    if (queue !== '') {
      frame = requestAnimationFrame(tick)
    } else {
      resolveDrained()
    }
  }

  return {
    push(text: string) {
      if (text === '') return

      if (immediate) {
        append(text)

        return
      }

      queue += text

      if (frame === 0) {
        frame = requestAnimationFrame(tick)
      }
    },

    drained() {
      if (queue === '' && frame === 0) return Promise.resolve()

      return new Promise<void>((resolve) => {
        drainWaiters.push(resolve)
      })
    },

    flush() {
      if (frame !== 0) {
        cancelAnimationFrame(frame)
        frame = 0
      }

      if (queue !== '') {
        append(queue)
        queue = ''
      }

      resolveDrained()
    },

    stop() {
      if (frame !== 0) {
        cancelAnimationFrame(frame)
        frame = 0
      }

      queue = ''
      resolveDrained()
    },
  }
}
