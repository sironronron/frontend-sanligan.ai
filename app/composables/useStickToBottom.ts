import type { Ref } from 'vue'

/** How close to the end still counts as reading the newest message. */
const PIN_THRESHOLD = 80

/**
 * Keep a scroll container sitting on its newest content.
 *
 * Scrolling once after `nextTick` is not enough for a chat thread: a streamed
 * answer keeps growing long after the patch that added it, and finishing a turn
 * swaps every optimistic message for the server's copy, which remounts the
 * whole list — and a list that briefly measures nothing takes the scroll
 * position to the top of the thread with it.
 *
 * So the anchor follows size rather than data. A ResizeObserver re-pins on
 * every height change, whenever it lands, and the only thing that releases the
 * pin is the user scrolling away from the end themselves.
 */
export function useStickToBottom(
  container: Ref<HTMLElement | null>,
  content: Ref<HTMLElement | null>,
) {
  /** Whether new content should pull the view down with it. */
  const pinned = ref(true)

  function pin() {
    const el = container.value
    if (!el) return
    el.scrollTop = el.scrollHeight
  }

  function onScroll() {
    const el = container.value
    if (!el) return

    // A thread that does not overflow says nothing about what the user wants;
    // this is also the shape a mid-remount thread has, and re-pinning off that
    // would undo a deliberate scroll up.
    if (el.scrollHeight <= el.clientHeight) return

    // Our own writes land exactly at the end, so they re-affirm the pin rather
    // than read as the user leaving it.
    pinned.value = el.scrollHeight - el.scrollTop - el.clientHeight <= PIN_THRESHOLD
  }

  /**
   * Go to the end and stay there, wherever the user was — for the moments they
   * are asking for the newest message: sending one, or opening a thread.
   */
  function scrollToBottom() {
    pinned.value = true
    pin()
  }

  let observer: ResizeObserver | null = null
  let listening: HTMLElement | null = null

  watch(
    [container, content],
    ([el, inner]) => {
      if (!import.meta.client) return

      listening?.removeEventListener('scroll', onScroll)
      listening = el
      el?.addEventListener('scroll', onScroll, { passive: true })

      observer?.disconnect()
      if (!el) return

      observer ??= new ResizeObserver(() => {
        if (pinned.value) pin()
      })

      // The container as well as the thread: the composer growing underneath it
      // changes how much of the thread fits without changing the thread.
      observer.observe(el)
      if (inner) observer.observe(inner)
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    listening?.removeEventListener('scroll', onScroll)
    observer?.disconnect()
  })

  return { pinned, scrollToBottom }
}
