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
    target: 'nav-files',
    route: '/cases',
    placement: 'bottom',
    title: 'Attach the documents you already have',
    body: 'Upload titles, contracts, notices, or photos of them. Scanned PDFs and images are read with OCR, so a phone photo of a TCT works.',
  },
  {
    target: 'documents-upload',
    route: '/files',
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

/**
 * The verified-lawyer first-run. A lawyer lands on the workspace rather than
 * the chat, so the walkthrough stays there: control availability, read the
 * offers, work a matter, and keep the journal.
 */
export const LAWYER_TOUR_STEPS: TourStep[] = [
  {
    target: 'lawyer-availability',
    route: '/lawyer/dashboard',
    placement: 'bottom',
    title: 'Control when you get work',
    body: 'Keep this toggle on to be offered document requests matched to your practice. Switch it off when you are too busy to take new matters.',
  },
  {
    target: 'lawyer-offered',
    route: '/lawyer/dashboard',
    placement: 'bottom',
    title: 'Review the requests offered to you',
    body: 'A request you are matched with appears here first — its document type, fee, and urgency. Open it to read the full document and see who submitted it before you accept or decline.',
  },
  {
    target: 'lawyer-active',
    route: '/lawyer/dashboard',
    placement: 'bottom',
    title: 'Work your active matters',
    body: 'Accepted requests move here. On each one you open the document, ask the submitter for anything you need, mark it vetted, and schedule a notarization — all on the same page.',
  },
  {
    target: 'lawyer-journal',
    route: '/lawyer/dashboard',
    placement: 'bottom',
    title: 'Your notarial journal is kept for you',
    body: 'Every notarization you record lands here with its certificate number — the official register of the notarial acts you have performed.',
    cta: 'Start using Batayan',
  },
]

export function useProductTour() {
  const auth = useAuthStore()

  const active = useState('tour-active', () => false)
  const index = useState('tour-index', () => 0)
  /** Opens first-run: what Batayan is, then take the tour or skip it. */
  const introducing = useState('tour-introducing', () => false)
  /** Shown once, the first time the tour is finished or skipped. */
  const welcoming = useState('tour-welcoming', () => false)

  /** Which walkthrough fits this account: the workspace for a verified lawyer, chat otherwise. */
  const steps = computed<TourStep[]>(() => (auth.isVerifiedLawyer ? LAWYER_TOUR_STEPS : TOUR_STEPS))

  const step = computed<TourStep | null>(() => (active.value ? steps.value[index.value] ?? null : null))
  const isLast = computed(() => index.value >= steps.value.length - 1)
  const total = computed(() => steps.value.length)

  function hasCompleted(): boolean {
    return auth.user?.tour_completed_at != null
  }

  function start(): void {
    index.value = 0
    introducing.value = false
    active.value = true
  }

  /** "Show me around" on the intro. */
  function beginTour(): void {
    start()
  }

  /**
   * "Skip for now" on the intro. The tour is marked seen rather than deferred:
   * the intro already covered what the app does, and re-opening it on every
   * sign-in would nag someone who has said no once. The account menu keeps it
   * reachable.
   */
  function skipIntro(): void {
    introducing.value = false

    // Fire-and-forget, as in finish() — dismissing must not wait on the network.
    void auth.completeTour()
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
   * Offer the tour once, after onboarding is done. It waits for the profile so
   * a user who is still choosing a role is not interrupted mid-form, and it
   * never runs for someone who has already seen it.
   *
   * First-run opens on the intro rather than the first spotlight: a tooltip
   * pointing at the composer means little to someone who does not yet know
   * what Batayan is for. A lawyer application skips the KYC questions, so a
   * verified profile counts as onboarding done there.
   */
  function maybeStart(): void {
    // Never reopen over a tour already in progress — this is called from a
    // watcher that can fire again while the user is midway through it.
    if (introducing.value || active.value || !auth.user || hasCompleted()) return
    if (!auth.kycCompleted && !auth.isVerifiedLawyer) return

    introducing.value = true
  }

  return { active, index, step, steps, isLast, total, introducing, welcoming, start, beginTour, skipIntro, restart, finish, next, back, maybeStart, hasCompleted, dismissWelcome }
}
