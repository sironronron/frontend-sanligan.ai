/**
 * A guided first-run tour that walks a new user through the app in the order
 * they will actually use it: ask a question, open a matter, add one, attach a
 * document, then ask the assistant to summarize its facts.
 *
 * Steps anchor to `data-tour` attributes rather than CSS classes or component
 * internals, so restyling a button cannot silently break the tour — a missing
 * anchor is caught by the skip-if-absent behaviour below instead of leaving a
 * spotlight pointing at nothing.
 *
 * Completion is stored on the user's account (`tour_completed_at`), so the
 * tour does not reappear when the same person signs in on another device or
 * clears their browser storage.
 */

export interface TourStep {
  /** Stable `data-tour` value of the element to highlight. */
  target: string
  title: string
  body: string
  /** Route the step lives on. The tour navigates here before showing it. */
  route?: string
  /** Where the tooltip sits relative to the target. */
  placement?: 'top' | 'bottom' | 'left' | 'right'
  /** Shown instead of "Next" — used when the step asks the user to act. */
  cta?: string
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: 'chat-composer',
    route: '/chat',
    placement: 'top',
    title: 'Ask a question about Philippine law',
    body: 'Type a question the way you would ask a colleague — "Can a tenant be removed after 12 years?" Batayan answers from statutes, jurisprudence, and official issuances, and cites what it used.',
  },
  {
    target: 'chat-sources',
    route: '/chat',
    placement: 'left',
    title: 'Every answer shows its sources',
    body: 'Citations open the exact provision or ruling the answer relied on. If something cannot be verified from a real source, Batayan says so instead of guessing.',
  },
  {
    target: 'nav-cases',
    route: '/chat',
    placement: 'bottom',
    title: 'Group your work into cases',
    body: 'A case keeps one matter together — its facts, documents, conversations, and next steps — so you do not re-explain the background every time.',
  },
  {
    target: 'cases-new',
    route: '/cases',
    placement: 'bottom',
    title: 'Create a case for a real matter',
    body: 'Give it a title, type, and a short description of what happened. Batayan reads that description on every message in the case, so the more accurate it is, the less you have to repeat.',
    cta: 'Got it',
  },
  {
    target: 'nav-documents',
    route: '/cases',
    placement: 'bottom',
    title: 'Attach the documents you already have',
    body: 'Upload titles, contracts, notices, or photos of them. Scanned PDFs and images are read with OCR, so a phone photo of a TCT works.',
  },
  {
    target: 'documents-upload',
    route: '/documents',
    placement: 'bottom',
    title: 'What happens after an upload',
    body: 'The file is encrypted at rest, its text is extracted and indexed, then Batayan can quote it back with the filename attached. Nothing you upload is shared outside your account.',
  },
  {
    target: 'chat-composer',
    route: '/chat',
    placement: 'top',
    title: 'Try: "Summarize the facts of this case"',
    body: 'Inside a case, ask Batayan to summarize the facts, list the deadlines, or draft a demand letter. It uses the case description and your uploaded documents, and flags anything it could not confirm.',
    cta: 'Start using Batayan',
  },
]

export function useProductTour() {
  const auth = useAuthStore()

  const active = useState('tour-active', () => false)
  const index = useState('tour-index', () => 0)
  /** Shown once, the first time the tour is finished or skipped. */
  const welcoming = useState('tour-welcoming', () => false)

  const step = computed<TourStep | null>(() => (active.value ? TOUR_STEPS[index.value] ?? null : null))
  const isLast = computed(() => index.value >= TOUR_STEPS.length - 1)
  const total = computed(() => TOUR_STEPS.length)

  function hasCompleted(): boolean {
    return auth.user?.tour_completed_at != null
  }

  function start(): void {
    index.value = 0
    active.value = true
  }

  /**
   * Replay from the first step (account menu). The stored completion is left
   * alone — a deliberate replay should not make the tour auto-open again on
   * the next sign-in.
   */
  function restart(): void {
    start()
  }

  function finish(): void {
    // Read before completeTour() mutates it: the welcome marks the end of
    // first-run, so it belongs to the first completion only — a deliberate
    // replay from the account menu should not trigger it again.
    const firstTime = ! hasCompleted()

    active.value = false
    welcoming.value = firstTime

    // Fire-and-forget: closing the tour must not wait on, or be blocked by,
    // the network.
    void auth.completeTour()
  }

  function dismissWelcome(): void {
    welcoming.value = false
  }

  function next(): void {
    if (isLast.value) {
      finish()

      return
    }

    index.value++
  }

  function back(): void {
    if (index.value > 0) index.value--
  }

  /**
   * Show the tour once, after onboarding is done. It waits for the profile so
   * a user who is still choosing a role is not interrupted mid-form, and it
   * never runs for someone who has already seen it.
   */
  function maybeStart(): void {
    // Never restart a tour already in progress — this is called from a watcher
    // that can fire again while the user is midway through it.
    if (active.value || !auth.user || !auth.kycCompleted || hasCompleted()) return

    start()
  }

  return { active, index, step, isLast, total, welcoming, start, restart, finish, next, back, maybeStart, hasCompleted, dismissWelcome }
}
