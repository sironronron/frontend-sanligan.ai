/**
 * Smooths SSE text deltas into a character-by-character reveal.
 *
 * The providers do not stream one character at a time — Anthropic and Gemini
 * emit chunks of several words, and a tool round-trip can land a whole
 * paragraph in a single frame. Appending each delta straight onto the message
 * therefore makes the answer arrive in visible jumps.
 *
 * Deltas are queued here instead and drained on an animation frame. The drain
 * is proportional to the backlog rather than a fixed rate: a slow provider
 * reveals a few characters per frame, a fast one speeds up to keep pace, and
 * the visible lag stays at roughly SMOOTHING frames either way. A fixed rate
 * cannot do both — it either crawls behind a fast model or stutters with a
 * slow one.
 */

/** Frames the queue is spread over. ~10 at 60fps is a touch under 200ms. */
const SMOOTHING = 10

export interface TextStreamer {
  /** Queue a delta for reveal. */
  push(text: string): void
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

  const tick = () => {
    frame = 0

    if (queue === '') return

    const size = Math.max(1, Math.ceil(queue.length / SMOOTHING))

    append(queue.slice(0, size))
    queue = queue.slice(size)

    if (queue !== '') {
      frame = requestAnimationFrame(tick)
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

    flush() {
      if (frame !== 0) {
        cancelAnimationFrame(frame)
        frame = 0
      }

      if (queue !== '') {
        append(queue)
        queue = ''
      }
    },

    stop() {
      if (frame !== 0) {
        cancelAnimationFrame(frame)
        frame = 0
      }

      queue = ''
    },
  }
}
