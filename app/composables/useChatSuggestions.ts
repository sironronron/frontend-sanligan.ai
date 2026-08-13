import type { ChatMessage } from '~/types/chat'

export type SuggestionIcon =
  | 'sparkles'
  | 'file'
  | 'scale'
  | 'clock'
  | 'checklist'
  | 'search'
  | 'landmark'
  | 'calculator'
  | 'help'

export interface Suggestion {
  label: string
  prompt: string
  icon?: SuggestionIcon
}

/** A task already tracked for the thread, used to keep suggestions on the real plan. */
export interface SuggestionTask {
  title: string
  status?: string | null
  priority?: string | null
  due_hint?: string | null
}

/**
 * Everything outside the message stream that should steer suggestions: the
 * case record, the tasks already drafted for it, and the self-reported profile
 * from onboarding. All fields are optional — the plain chat page has no case,
 * and a user may have skipped onboarding.
 */
export interface SuggestionContext {
  caseTitle?: string | null
  caseType?: string | null
  caseDescription?: string | null
  caseStatus?: string | null
  casePriority?: string | null
  tags?: string[]
  relatedParties?: string[]
  dueDate?: string | null
  threadPurpose?: string | null
  templateName?: string | null
  openTasks?: SuggestionTask[]
  recentThreadTitles?: string[]
  role?: string | null
  useCase?: string | null
  documentTypes?: string[]
  experienceLevel?: string | null
}

type Topic =
  | 'eminent_domain'
  | 'agrarian'
  | 'labor'
  | 'debt_collection'
  | 'property'
  | 'contract'
  | 'tax'
  | 'family'
  | 'criminal'
  | 'estate'
  | 'consumer'
  | 'government_permit'
  | 'barangay'

type Phase =
  | 'intake'
  | 'analysis'
  | 'research'
  | 'evidence'
  | 'drafting'
  | 'review'
  | 'filing'
  | 'deadline'
  | 'negotiation'
  | 'hearing'
  | 'compliance'
  | 'general'

/** Documents the thread may already have produced — never offer to draft one twice. */
type Artifact =
  | 'demand_letter'
  | 'complaint'
  | 'affidavit'
  | 'position_paper'
  | 'motion'
  | 'contract'
  | 'deed'

interface Action {
  id: string
  label: string
  prompt: string
  icon?: SuggestionIcon
  /** Offer only when the thread mentions one of these terms. */
  needs?: string[]
  /** Skip once the thread has produced this document. */
  unless?: Artifact
}

interface Candidate extends Suggestion {
  id: string
  score: number
}

interface WeightedText {
  text: string
  weight: number
}

/** What the thread and the case together say about where the matter stands. */
interface Signals {
  phase: Phase
  topics: Topic[]
  produced: Set<Artifact>
  mentioned: Set<Artifact>
  /** Weighted view of the thread: latest reply first, then the user's last ask. */
  thread: WeightedText[]
  /** Thread text plus the case record, for topic detection. */
  corpus: WeightedText[]
  lastAssistant: ChatMessage | null
  lastAssistantText: string
  recentAsks: string[]
  askedQuestion: boolean
  draftedNow: boolean
  beginner: boolean
  context: SuggestionContext
}

const patternCache = new Map<string, RegExp>()

function termPattern(term: string): string {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const prefix = /^[a-z0-9]/i.test(term) ? '\\b' : ''
  const suffix = /[a-z0-9]$/i.test(term) ? '\\b' : ''

  return `${prefix}${escaped}${suffix}`
}

function matcher(terms: string[]): RegExp {
  const key = terms.join('|')
  const cached = patternCache.get(key)
  if (cached) return cached

  const pattern = new RegExp(terms.map(termPattern).join('|'), 'gi')
  patternCache.set(key, pattern)

  return pattern
}

function countMatches(terms: string[], text: string): number {
  if (!text) return 0

  const pattern = matcher(terms)
  pattern.lastIndex = 0

  let count = 0
  while (pattern.exec(text) !== null) {
    count += 1
    if (count > 8) break
  }

  return count
}

function weightedScore(terms: string[], parts: WeightedText[]): number {
  return parts.reduce((total, part) => total + countMatches(terms, part.text) * part.weight, 0)
}

function mentions(terms: string[], parts: WeightedText[]): boolean {
  return parts.some((part) => countMatches(terms, part.text) > 0)
}

const TOPIC_TERMS: Record<Topic, string[]> = {
  eminent_domain: ['eminent domain', 'expropriation', 'expropriate', 'condemnation', 'just compensation', 'right of way', 'dpwh', 'road widening'],
  agrarian: ['agrarian', 'carp', 'ra 6657', 'dar', 'emancipation patent', 'cloa', 'tenant farmer', 'leasehold', 'landholding'],
  labor: ['labor', 'employee', 'employer', 'dismissal', 'terminated', 'termination', 'resignation', 'separation pay', 'backwages', 'nlrc', 'dole', 'regularization', 'illegal dismissal', 'final pay'],
  debt_collection: ['debt', 'loan', 'collection', 'unpaid', 'obligation', 'promissory note', 'arrears', 'default', 'bounced check', 'bp 22'],
  property: ['title', 'land', 'lot', 'real property', 'real estate', 'registry of deeds', 'tct', 'oct', 'tax declaration', 'boundary', 'encroachment', 'easement', 'lease', 'tenant', 'ejectment', 'unlawful detainer'],
  contract: ['contract', 'agreement', 'breach', 'stipulation', 'clause', 'memorandum of agreement', 'deed of sale', 'terms and conditions'],
  tax: ['tax', 'bir', 'assessment', 'capital gains', 'documentary stamp', 'estate tax', 'real property tax', 'amilyar', 'revenue'],
  family: ['annulment', 'nullity of marriage', 'custody', 'support', 'legitimation', 'adoption', 'conjugal', 'vawc', 'ra 9262', 'spouse', 'marriage'],
  criminal: ['estafa', 'criminal', 'prosecutor', 'preliminary investigation', 'bail', 'arrest', 'blotter', 'swindling', 'theft', 'libel', 'cyberlibel'],
  estate: ['estate', 'inheritance', 'heirs', 'extrajudicial settlement', 'succession', 'last will', 'testate', 'intestate', 'partition'],
  consumer: ['consumer', 'refund', 'warranty', 'defective', 'dti', 'service provider', 'billing dispute'],
  government_permit: ['permit', 'license', 'clearance', 'accreditation', 'registration', 'lgu', 'barangay clearance', 'sec', 'dti registration', 'zoning'],
  barangay: ['barangay', 'katarungang pambarangay', 'lupon', 'punong barangay', 'certificate to file action', 'conciliation'],
}

const PHASE_TERMS: Record<Exclude<Phase, 'general'>, string[]> = {
  intake: ['need the following', 'kindly provide', 'please provide', 'could you confirm', 'clarify', 'more details', 'do you have', 'let me know'],
  analysis: ['issue', 'cause of action', 'strength', 'weakness', 'assessment', 'summary', 'summarize', 'overview', 'facts show', 'legal basis'],
  research: ['jurisprudence', 'supreme court', 'g.r. no', 'republic act', 'doctrine', 'ruling', 'case law', 'statute', 'article', 'civil code', 'revised penal code'],
  evidence: ['evidence', 'proof', 'receipt', 'witness', 'documentary', 'attach', 'supporting document', 'sworn statement', 'annex'],
  drafting: ['draft', 'letter', 'template', 'notarize', 'notarized', 'signature', 'signatory', 'pleading', 'wording'],
  review: ['review', 'revise', 'edit', 'finalize', 'proofread', 'change the', 'adjust the'],
  filing: ['file', 'filing fee', 'docket', 'clerk of court', 'submit', 'lodge', 'notary public', 'serve a copy', 'registered mail'],
  deadline: ['deadline', 'prescriptive period', 'prescription', 'reglementary', 'expire', 'lapse', 'calendar days', 'within 15 days', 'within 30 days', 'due date'],
  negotiation: ['settle', 'settlement', 'compromise', 'negotiate', 'amicable', 'mediation', 'conciliation', 'payment plan'],
  hearing: ['hearing', 'trial', 'summons', 'pre-trial', 'testimony', 'subpoena', 'court appearance', 'arraignment'],
  compliance: ['compliance', 'requirement', 'regulation', 'permit', 'license', 'registration', 'renewal', 'reportorial'],
}

const ARTIFACT_TERMS: Record<Artifact, string[]> = {
  demand_letter: ['demand letter', 'letter of demand', 'formal demand'],
  complaint: ['complaint', 'complaint-affidavit', 'verified complaint'],
  affidavit: ['affidavit', 'sworn statement', 'judicial affidavit'],
  position_paper: ['position paper', 'memorandum'],
  motion: ['motion'],
  contract: ['contract', 'agreement', 'memorandum of agreement'],
  deed: ['deed of sale', 'deed of donation', 'deed of assignment', 'extrajudicial settlement'],
}

/** Phrases that only appear in a finished Philippine legal document, not in chat prose. */
const DRAFT_MARKERS = [
  'very truly yours',
  'respectfully submitted',
  'subscribed and sworn',
  'republic of the philippines',
  'affiant further sayeth',
  'witnesseth',
  'in witness whereof',
  'know all men by these presents',
]

function looksLikeDraft(message: ChatMessage): boolean {
  if (message.template_id) return true

  return countMatches(DRAFT_MARKERS, message.content) > 0
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3)
}

/**
 * Drop a suggestion the user effectively just typed themselves — re-offering
 * their own question as a "next step" is the fastest way to look mechanical.
 */
function echoesRecentAsk(candidate: Candidate, asks: string[]): boolean {
  const words = tokens(candidate.label)
  if (words.length === 0) return false

  return asks.some((ask) => words.every((word) => ask.includes(word)))
}

/** Labels sit on a small button, so keep borrowed text (task titles) scannable. */
function clip(text: string, max = 40): string {
  const trimmed = text.trim()

  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed
}

function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null

  const target = new Date(date)
  if (Number.isNaN(target.getTime())) return null

  const start = new Date()
  start.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)

  return Math.round((target.getTime() - start.getTime()) / 86_400_000)
}

function formatDue(date: string): string {
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return date

  return parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

/** Priority-then-recency pick of the task the user should be working on now. */
function topOpenTask(tasks: SuggestionTask[] | undefined): SuggestionTask | null {
  const open = (tasks ?? []).filter((task) => task.status !== 'completed')
  if (open.length === 0) return null

  const rank: Record<string, number> = { high: 0, medium: 1, low: 2 }
  const ongoing = open.filter((task) => task.status === 'on-going')
  const pool = ongoing.length > 0 ? ongoing : open

  return [...pool].sort((a, b) => (rank[a.priority ?? ''] ?? 3) - (rank[b.priority ?? ''] ?? 3))[0] ?? null
}

function caseText(context: SuggestionContext): string {
  return [
    context.caseTitle,
    context.caseType?.replace(/_/g, ' '),
    context.caseDescription,
    context.threadPurpose,
    context.templateName,
    ...(context.tags ?? []),
    ...(context.openTasks ?? []).map((task) => task.title),
  ]
    .filter(Boolean)
    .join('. ')
}

/** The coarse workspace type is a weak hint; the case text is the real signal. */
const CASE_TYPE_TOPICS: Record<string, Topic> = {
  hr: 'labor',
  customer_support: 'consumer',
  administrative: 'government_permit',
}

function analyze(messages: ChatMessage[], context: SuggestionContext): Signals {
  const recent = messages.slice(-8)
  const lastAssistant = [...recent].reverse().find((m) => m.role === 'assistant') ?? null
  const lastUser = [...recent].reverse().find((m) => m.role === 'user') ?? null
  const lastAssistantText = lastAssistant?.content ?? ''

  const history = recent
    .filter((m) => m.id !== lastAssistant?.id && m.id !== lastUser?.id)
    .map((m) => m.content)
    .join('\n')

  const thread: WeightedText[] = [
    { text: lastAssistantText, weight: 3 },
    { text: lastUser?.content ?? '', weight: 2 },
    { text: history, weight: 1 },
  ]

  const corpus: WeightedText[] = [...thread, { text: caseText(context), weight: 3 }]

  const topics = (Object.keys(TOPIC_TERMS) as Topic[])
    .map((topic) => ({ topic, score: weightedScore(TOPIC_TERMS[topic], corpus) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.topic)

  const typeTopic = CASE_TYPE_TOPICS[context.caseType ?? '']
  if (typeTopic && !topics.includes(typeTopic)) topics.push(typeTopic)

  const phases = (Object.keys(PHASE_TERMS) as Array<Exclude<Phase, 'general'>>)
    .map((phase) => ({ phase, score: weightedScore(PHASE_TERMS[phase], thread) }))
    .sort((a, b) => b.score - a.score)

  const best = phases[0]
  const phase: Phase = best && best.score >= 2 ? best.phase : 'general'

  const produced = new Set<Artifact>()
  recent.forEach((message, index) => {
    if (message.role !== 'assistant' || !looksLikeDraft(message)) return

    // The user's request right before the draft names the document more
    // reliably than the draft's own body ("Draft a demand letter" → letter).
    const request = recent[index - 1]?.role === 'user' ? recent[index - 1]!.content : ''
    const body = `${message.content}\n${request}`

    ;(Object.keys(ARTIFACT_TERMS) as Artifact[]).forEach((artifact) => {
      if (countMatches(ARTIFACT_TERMS[artifact], body) > 0) produced.add(artifact)
    })
  })

  const mentioned = new Set<Artifact>()
  ;(Object.keys(ARTIFACT_TERMS) as Artifact[]).forEach((artifact) => {
    if (mentions(ARTIFACT_TERMS[artifact], thread)) mentioned.add(artifact)
  })

  const recentAsks = recent
    .filter((m) => m.role === 'user')
    .slice(-2)
    .map((m) => m.content.toLowerCase())

  const level = context.experienceLevel ?? null

  return {
    phase,
    topics,
    produced,
    mentioned,
    thread,
    corpus,
    lastAssistant,
    lastAssistantText,
    recentAsks,
    askedQuestion: /\?\s*$/.test(lastAssistantText.trim()),
    draftedNow: lastAssistant !== null && looksLikeDraft(lastAssistant),
    beginner: level === 'beginner',
    context,
  }
}

const TOPIC_PLAYBOOKS: Record<Topic, Action[]> = {
  eminent_domain: [
    {
      id: 'ed-demand',
      label: 'Demand just compensation',
      prompt: 'Draft a formal demand for just compensation, including interest for the delay, addressed to the taking agency.',
      icon: 'file',
      unless: 'demand_letter',
    },
    {
      id: 'ed-valuation',
      label: 'Check the valuation',
      prompt: 'Is the offered amount fair? Explain how just compensation is valued and what evidence I need to contest it.',
      icon: 'calculator',
      needs: ['zonal value', 'fair market value', 'offer', 'appraisal', 'valuation'],
    },
    {
      id: 'ed-interest',
      label: 'Compute interest on delay',
      prompt: 'Compute the legal interest owed for the delay in payment and show the basis for the rate used.',
      icon: 'calculator',
      needs: ['interest', 'delay', 'unpaid', 'years'],
    },
  ],
  agrarian: [
    {
      id: 'ag-rights',
      label: 'Explain my rights here',
      prompt: 'Explain my rights over this landholding under agrarian reform law, in plain language.',
      icon: 'scale',
    },
    {
      id: 'ag-dar',
      label: 'Bring this to DAR',
      prompt: 'Prepare the letter or petition to file with DAR for this matter, and list the attachments required.',
      icon: 'landmark',
    },
    {
      id: 'ag-docs',
      label: 'Documents to secure',
      prompt: 'Which land documents (CLOA, title, tax declaration, survey) should I secure, and where do I get each one?',
      icon: 'checklist',
    },
  ],
  labor: [
    {
      id: 'lb-assess',
      label: 'Was this dismissal legal?',
      prompt: 'Based on these facts, was the dismissal legal? Walk me through the substantive and procedural requirements.',
      icon: 'scale',
      needs: ['dismissal', 'terminated', 'termination', 'fired'],
    },
    {
      id: 'lb-money',
      label: 'Compute what I am owed',
      prompt: 'Compute the separation pay, backwages, final pay, and other benefits owed, and show how each figure is derived.',
      icon: 'calculator',
    },
    {
      id: 'lb-file',
      label: 'File with NLRC or DOLE',
      prompt: 'Should this go to the NLRC or DOLE? Explain the filing steps, the venue, and the deadline I must meet.',
      icon: 'landmark',
      unless: 'complaint',
    },
  ],
  debt_collection: [
    {
      id: 'dc-demand',
      label: 'Draft a demand letter',
      prompt: 'Draft a formal demand letter stating the amount due, the basis of the obligation, and a clear payment deadline.',
      icon: 'file',
      unless: 'demand_letter',
    },
    {
      id: 'dc-total',
      label: 'Compute the total due',
      prompt: 'Compute the total amount due including principal, interest, and penalties, and show the computation.',
      icon: 'calculator',
    },
    {
      id: 'dc-nonpayment',
      label: 'If they still refuse to pay',
      prompt: 'If the demand is ignored, what are my options — small claims, barangay conciliation, or a civil case? Compare cost and timeline.',
      icon: 'scale',
    },
  ],
  property: [
    {
      id: 'pr-title',
      label: 'Verify the title',
      prompt: 'How do I verify this title and check for liens, adverse claims, or other encumbrances? List the offices and fees.',
      icon: 'search',
      needs: ['title', 'ownership', 'tct', 'oct', 'registry'],
    },
    {
      id: 'pr-transfer',
      label: 'Steps to transfer ownership',
      prompt: 'Walk me through the steps, taxes, and documents needed to transfer this property to the buyer.',
      icon: 'checklist',
      needs: ['sale', 'buyer', 'transfer', 'deed'],
    },
    {
      id: 'pr-occupant',
      label: 'Deal with the occupant',
      prompt: 'What is the legal process for removing an occupant or tenant from this property, and how long does each stage take?',
      icon: 'scale',
      needs: ['occupant', 'tenant', 'squatter', 'ejectment', 'eviction', 'unlawful detainer'],
    },
  ],
  contract: [
    {
      id: 'ct-risks',
      label: 'Flag risky clauses',
      prompt: 'Review this agreement and flag the clauses that put me at risk, with a suggested rewrite for each.',
      icon: 'search',
    },
    {
      id: 'ct-breach',
      label: 'Remedies for the breach',
      prompt: 'What remedies do I have for this breach — rescission, specific performance, or damages? Explain which fits my facts.',
      icon: 'scale',
      needs: ['breach', 'violated', 'did not deliver', 'failed to'],
    },
    {
      id: 'ct-draft',
      label: 'Draft the agreement',
      prompt: 'Draft the agreement covering these terms, with the clauses a Philippine contract of this type should contain.',
      icon: 'file',
      unless: 'contract',
    },
  ],
  tax: [
    {
      id: 'tx-liability',
      label: 'Compute the tax due',
      prompt: 'Compute the taxes due on this transaction, including deadlines for each and the penalties for late payment.',
      icon: 'calculator',
    },
    {
      id: 'tx-contest',
      label: 'Contest the assessment',
      prompt: 'How do I protest this assessment? Give the deadline, the office to file with, and a draft of the protest letter.',
      icon: 'landmark',
      needs: ['assessment', 'deficiency', 'notice', 'bir'],
    },
  ],
  family: [
    {
      id: 'fm-options',
      label: 'Compare my options',
      prompt: 'Compare my legal options here, with the requirements, cost range, and realistic timeline of each.',
      icon: 'scale',
    },
    {
      id: 'fm-support',
      label: 'Support and custody rules',
      prompt: 'Explain how support and custody are decided under Philippine law for this situation.',
      icon: 'scale',
      needs: ['support', 'custody', 'child', 'children'],
    },
    {
      id: 'fm-protection',
      label: 'Immediate protection steps',
      prompt: 'What immediate protection can I get, and where do I apply for it today?',
      icon: 'clock',
      needs: ['abuse', 'violence', 'vawc', 'threat', 'harassment', 'protection order'],
    },
  ],
  criminal: [
    {
      id: 'cr-elements',
      label: 'Do the facts fit the offense?',
      prompt: 'Do these facts establish every element of the offense? Point out what is still missing.',
      icon: 'scale',
    },
    {
      id: 'cr-complaint',
      label: 'Prepare the complaint-affidavit',
      prompt: 'Prepare the complaint-affidavit for filing with the prosecutor, and list the annexes it must carry.',
      icon: 'file',
      unless: 'complaint',
    },
    {
      id: 'cr-process',
      label: 'What happens after filing',
      prompt: 'Walk me through what happens after filing — preliminary investigation, counter-affidavit, resolution — and how long each takes.',
      icon: 'clock',
    },
  ],
  estate: [
    {
      id: 'es-settlement',
      label: 'Settle the estate',
      prompt: 'Can this estate be settled extrajudicially? Give the requirements, the publication rule, and the taxes involved.',
      icon: 'checklist',
    },
    {
      id: 'es-shares',
      label: 'Compute the heirs’ shares',
      prompt: 'Compute each heir’s share under Philippine succession law based on these facts.',
      icon: 'calculator',
    },
  ],
  consumer: [
    {
      id: 'cs-demand',
      label: 'Demand a refund or repair',
      prompt: 'Draft a demand letter for a refund or replacement, citing the consumer protection rules that apply.',
      icon: 'file',
      unless: 'demand_letter',
    },
    {
      id: 'cs-dti',
      label: 'File a DTI complaint',
      prompt: 'How do I file a complaint with the DTI for this? List the requirements, the venue, and what to expect.',
      icon: 'landmark',
    },
  ],
  government_permit: [
    {
      id: 'gp-requirements',
      label: 'List the requirements',
      prompt: 'List every requirement, fee, and office involved in this application, in the order I should complete them.',
      icon: 'checklist',
    },
    {
      id: 'gp-letter',
      label: 'Draft the request letter',
      prompt: 'Draft the letter requesting this from the agency, in the format government offices expect.',
      icon: 'file',
    },
    {
      id: 'gp-denied',
      label: 'Appeal the denial',
      prompt: 'The application was denied or delayed — what is my remedy, and what is the deadline to act?',
      icon: 'clock',
      needs: ['denied', 'denial', 'rejected', 'refused', 'delayed'],
    },
  ],
  barangay: [
    {
      id: 'bg-required',
      label: 'Is barangay conciliation required?',
      prompt: 'Do I have to go through barangay conciliation first, or is my case exempt? Explain why.',
      icon: 'scale',
    },
    {
      id: 'bg-prepare',
      label: 'Prepare for the hearing',
      prompt: 'How do I prepare for the barangay hearing — what to bring, what to say, and what settlement terms to consider?',
      icon: 'checklist',
    },
    {
      id: 'bg-cfa',
      label: 'Get a Certificate to File Action',
      prompt: 'How do I secure a Certificate to File Action, and what do I do with it next?',
      icon: 'landmark',
      needs: ['certificate to file action', 'failed', 'no settlement', 'refused'],
    },
  ],
}

const PHASE_PLAYBOOKS: Record<Phase, Action[]> = {
  intake: [
    {
      id: 'ph-intake-why',
      label: 'Why do you need that?',
      prompt: 'Why is that information needed, and what happens if I cannot produce it?',
      icon: 'help',
    },
    {
      id: 'ph-intake-missing',
      label: 'What I still need to gather',
      prompt: 'List everything you still need from me, and tell me where I can obtain each item.',
      icon: 'checklist',
    },
  ],
  analysis: [
    {
      id: 'ph-analysis-strength',
      label: 'How strong is my position?',
      prompt: 'Assess the strengths and weaknesses of my position, and tell me what would make it stronger.',
      icon: 'scale',
    },
    {
      id: 'ph-analysis-plan',
      label: 'Give me a plan',
      prompt: 'Turn this into a step-by-step plan with what to do first, who to approach, and the deadlines involved.',
      icon: 'checklist',
    },
    {
      id: 'ph-analysis-risk',
      label: 'What could go wrong',
      prompt: 'What are the risks, costs, and worst-case outcomes I should prepare for?',
      icon: 'help',
    },
  ],
  research: [
    {
      id: 'ph-research-cases',
      label: 'Find supporting cases',
      prompt: 'Find Supreme Court decisions that support this position, and summarize what each one held.',
      icon: 'search',
    },
    {
      id: 'ph-research-apply',
      label: 'Apply this to my facts',
      prompt: 'Apply these rules to my specific facts and tell me the likely outcome.',
      icon: 'scale',
    },
    {
      id: 'ph-research-against',
      label: 'What is the other side?',
      prompt: 'What is the strongest argument against me here, and how do I answer it?',
      icon: 'help',
    },
  ],
  evidence: [
    {
      id: 'ph-evidence-list',
      label: 'Checklist of evidence',
      prompt: 'Give me a checklist of the documents and evidence I need, marked by which are essential and where to get them.',
      icon: 'checklist',
    },
    {
      id: 'ph-evidence-affidavit',
      label: 'Draft the affidavit',
      prompt: 'Draft the affidavit covering these facts, in the form required for notarization.',
      icon: 'file',
      unless: 'affidavit',
    },
    {
      id: 'ph-evidence-missing',
      label: 'If a document is missing',
      prompt: 'Some of these documents are missing or unavailable — what can I use in their place?',
      icon: 'help',
    },
  ],
  drafting: [
    {
      id: 'ph-drafting-draft',
      label: 'Draft it for me',
      prompt: 'Draft the document we discussed, using the facts already in this thread.',
      icon: 'file',
    },
    {
      id: 'ph-drafting-details',
      label: 'What details are missing?',
      prompt: 'What details are still missing before this document can be finalized?',
      icon: 'help',
    },
  ],
  review: [
    {
      id: 'ph-review-check',
      label: 'Check it for gaps',
      prompt: 'Review the draft for missing details, weak wording, and anything that could be used against me.',
      icon: 'search',
    },
    {
      id: 'ph-review-tone',
      label: 'Make it firmer',
      prompt: 'Rewrite this in a firmer, more formal tone while keeping the facts unchanged.',
      icon: 'file',
    },
  ],
  filing: [
    {
      id: 'ph-filing-where',
      label: 'Where and how to file',
      prompt: 'Where exactly do I file this, what are the fees, and how many copies do I bring?',
      icon: 'landmark',
    },
    {
      id: 'ph-filing-service',
      label: 'How to serve it properly',
      prompt: 'How do I serve this on the other party so the service is provable later?',
      icon: 'checklist',
    },
    {
      id: 'ph-filing-after',
      label: 'What happens after filing',
      prompt: 'What happens after filing, and what should I be ready for at each stage?',
      icon: 'clock',
    },
  ],
  deadline: [
    {
      id: 'ph-deadline-list',
      label: 'List every deadline',
      prompt: 'List every deadline that applies here in a table, with the consequence of missing each one.',
      icon: 'clock',
    },
    {
      id: 'ph-deadline-order',
      label: 'What to do first',
      prompt: 'Given these deadlines, what should I do first, and what can wait?',
      icon: 'checklist',
    },
    {
      id: 'ph-deadline-missed',
      label: 'If the deadline passed',
      prompt: 'If a deadline has already lapsed, what options do I still have?',
      icon: 'help',
    },
  ],
  negotiation: [
    {
      id: 'ph-negotiation-terms',
      label: 'Propose settlement terms',
      prompt: 'Propose settlement terms that protect my interests, and tell me which points I can concede.',
      icon: 'scale',
    },
    {
      id: 'ph-negotiation-agreement',
      label: 'Put it in writing',
      prompt: 'Draft the settlement agreement covering these terms, in a form that is enforceable.',
      icon: 'file',
    },
    {
      id: 'ph-negotiation-walk',
      label: 'When to walk away',
      prompt: 'Compare settling with pursuing the case — cost, time, and likely recovery for each.',
      icon: 'calculator',
    },
  ],
  hearing: [
    {
      id: 'ph-hearing-prepare',
      label: 'Prepare me for the hearing',
      prompt: 'What should I bring, wear, say, and expect at this hearing?',
      icon: 'checklist',
    },
    {
      id: 'ph-hearing-questions',
      label: 'Likely questions',
      prompt: 'What questions am I likely to be asked, and how should I answer each one truthfully?',
      icon: 'help',
    },
    {
      id: 'ph-hearing-miss',
      label: 'If I cannot attend',
      prompt: 'What happens if I cannot attend, and how do I ask for a resetting?',
      icon: 'clock',
    },
  ],
  compliance: [
    {
      id: 'ph-compliance-list',
      label: 'Requirements and deadlines',
      prompt: 'List the compliance requirements and their deadlines, ordered by what I must do first.',
      icon: 'checklist',
    },
    {
      id: 'ph-compliance-docs',
      label: 'Prepare the paperwork',
      prompt: 'Prepare the documents this compliance requires, and tell me who signs each one.',
      icon: 'file',
    },
  ],
  general: [
    {
      id: 'ph-general-next',
      label: 'What should I do next?',
      prompt: 'Based on everything discussed, what are the concrete next steps I should take, in order?',
      icon: 'checklist',
    },
    {
      id: 'ph-general-law',
      label: 'Which law applies?',
      prompt: 'Which specific laws or rules apply to my situation, and what do they require of me?',
      icon: 'scale',
    },
    {
      id: 'ph-general-draft',
      label: 'Draft what I need',
      prompt: 'Draft the document I need for this matter based on the facts above.',
      icon: 'file',
    },
  ],
}

/** Once a document exists, the useful moves are about using it, not writing more. */
const AFTER_DRAFT_ACTIONS: Action[] = [
  {
    id: 'draft-review',
    label: 'Check it before I send it',
    prompt: 'Review this draft for missing details, wrong dates, and anything I should fix before sending it.',
    icon: 'search',
  },
  {
    id: 'draft-deliver',
    label: 'How do I send it properly?',
    prompt: 'How do I deliver this so I have proof of receipt, and who exactly should receive it?',
    icon: 'checklist',
  },
  {
    id: 'draft-response',
    label: 'If they do not respond',
    prompt: 'What do I do if they ignore this or refuse, and how long should I wait before escalating?',
    icon: 'clock',
  },
]

function usable(action: Action, signals: Signals): boolean {
  if (action.unless && signals.produced.has(action.unless)) return false
  if (action.needs && !mentions(action.needs, signals.corpus)) return false

  return true
}

function toCandidate(action: Action, score: number): Candidate {
  return { id: action.id, label: action.label, prompt: action.prompt, icon: action.icon, score }
}

function buildCandidates(signals: Signals): Candidate[] {
  const candidates: Candidate[] = []
  const { context } = signals

  // The tracked plan beats every heuristic: if Batayan already wrote tasks for
  // this thread, the next step is whichever task is still open.
  const task = topOpenTask(context.openTasks)
  if (task) {
    candidates.push({
      id: 'task-top',
      label: `Help me: ${clip(task.title, 36)}`,
      prompt: `Walk me through this step in detail: "${task.title}". Tell me exactly what to prepare, where to go, and what it costs.`,
      icon: 'checklist',
      score: 95,
    })
  }

  const days = daysUntil(context.dueDate)
  if (days !== null && days <= 21) {
    candidates.push(
      days < 0
        ? {
            id: 'due-overdue',
            label: 'This case is past due',
            prompt: `The deadline for this case (${formatDue(context.dueDate!)}) has passed. What are my remaining options, and what should I do today?`,
            icon: 'clock',
            score: 88,
          }
        : {
            id: 'due-soon',
            label: `Plan before ${formatDue(context.dueDate!)}`,
            prompt: `The deadline for this case is ${formatDue(context.dueDate!)}. What must be finished before then, and in what order?`,
            icon: 'clock',
            score: 85,
          },
    )
  }

  // A question left hanging deserves an answer, not a menu of new topics, so
  // this replaces the usual playbooks instead of merely outranking them.
  if (signals.askedQuestion) {
    candidates.push({
      id: 'answer-unknown',
      label: 'I am not sure — help me answer',
      prompt: 'I am not sure how to answer that. Explain what you need and why, and give an example of a good answer.',
      icon: 'help',
      score: 92,
    })

    PHASE_PLAYBOOKS.intake.forEach((action, index) => candidates.push(toCandidate(action, 60 - index)))

    return candidates
  }

  if (signals.draftedNow) {
    AFTER_DRAFT_ACTIONS.forEach((action, index) => {
      if (usable(action, signals)) candidates.push(toCandidate(action, 80 - index))
    })
  }

  signals.topics.forEach((topic, topicIndex) => {
    TOPIC_PLAYBOOKS[topic].forEach((action, index) => {
      if (!usable(action, signals)) return

      const promoted = action.needs && mentions(action.needs, signals.thread) ? 10 : 0
      candidates.push(toCandidate(action, 65 - topicIndex * 8 - index + promoted))
    })
  })

  PHASE_PLAYBOOKS[signals.phase].forEach((action, index) => {
    if (usable(action, signals)) candidates.push(toCandidate(action, 45 - index))
  })

  if (signals.beginner && signals.lastAssistantText.length > 900) {
    candidates.push({
      id: 'plain-language',
      label: 'Explain this simply',
      prompt: 'Explain your last answer in plain, everyday language, as if I have no legal background.',
      icon: 'help',
      score: 50,
    })
  }

  PHASE_PLAYBOOKS.general.forEach((action, index) => {
    candidates.push(toCandidate(action, 20 - index))
  })

  return candidates
}

function rank(candidates: Candidate[], asks: string[], limit: number): Suggestion[] {
  const seen = new Set<string>()
  const picked: Suggestion[] = []

  for (const candidate of [...candidates].sort((a, b) => b.score - a.score)) {
    const key = candidate.label.toLowerCase()
    if (seen.has(candidate.id) || seen.has(key)) continue
    if (echoesRecentAsk(candidate, asks)) continue

    seen.add(candidate.id)
    seen.add(key)
    picked.push({ label: candidate.label, prompt: candidate.prompt, icon: candidate.icon })

    if (picked.length === limit) break
  }

  return picked
}

/**
 * Follow-up actions shown under the thread. Reads the recent exchange *and*
 * the case record, so the offer reflects where this matter actually stands
 * rather than the last keyword the assistant happened to use.
 */
export function useChatSuggestions(
  messages: Ref<ChatMessage[]>,
  experienceLevel: Ref<string | null>,
  streaming: Ref<boolean>,
  context?: Ref<SuggestionContext>,
) {
  const suggestions = computed<Suggestion[]>(() => {
    if (streaming.value) return []
    if (messages.value.length === 0) return []
    if (experienceLevel.value !== 'beginner' && experienceLevel.value !== 'intermediate') return []

    const resolved: SuggestionContext = {
      ...(context?.value ?? {}),
      experienceLevel: experienceLevel.value,
    }

    const signals = analyze(messages.value, resolved)
    if (!signals.lastAssistant || !signals.lastAssistantText) return []

    return rank(buildCandidates(signals), signals.recentAsks, 3)
  })

  return { suggestions }
}

/** Opening moves for a case, ordered by how concrete they are for this matter. */
function caseStarters(context: SuggestionContext): Candidate[] {
  const candidates: Candidate[] = []
  const corpus: WeightedText[] = [{ text: caseText(context), weight: 1 }]

  const task = topOpenTask(context.openTasks)
  if (task) {
    candidates.push({
      id: 'start-task',
      label: `Start with: ${clip(task.title, 30)}`,
      prompt: `Walk me through this step in detail: "${task.title}". Tell me what to prepare, where to go, and what it costs.`,
      icon: 'checklist',
      score: 95,
    })
  }

  const days = daysUntil(context.dueDate)
  if (days !== null && days <= 21) {
    candidates.push({
      id: 'start-due',
      label: days < 0 ? 'Handle the missed deadline' : `Plan before ${formatDue(context.dueDate!)}`,
      prompt:
        days < 0
          ? `The deadline for this case (${formatDue(context.dueDate!)}) has passed. What can I still do, and what should I do first?`
          : `This case is due ${formatDue(context.dueDate!)}. What must be finished before then, and in what order?`,
      icon: 'clock',
      score: 90,
    })
  }

  // A thread created for a stated purpose should open on that purpose.
  if (context.threadPurpose) {
    candidates.push({
      id: 'start-purpose',
      label: `Start: ${clip(context.threadPurpose, 30)}`,
      prompt: `Let's work on this: ${context.threadPurpose}. Use what the case record already has, and tell me what else you need from me.`,
      icon: 'sparkles',
      score: 80,
    })
  }

  if (context.templateName) {
    candidates.push({
      id: 'start-template',
      label: `Draft the ${context.templateName}`,
      prompt: `Draft the ${context.templateName} for this case and tell me what details you still need from me.`,
      icon: 'file',
      score: 70,
    })
  }

  const topics = (Object.keys(TOPIC_TERMS) as Topic[])
    .map((topic) => ({ topic, score: weightedScore(TOPIC_TERMS[topic], corpus) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((entry) => entry.topic)

  const typeTopic = CASE_TYPE_TOPICS[context.caseType ?? '']
  if (typeTopic && !topics.includes(typeTopic)) topics.push(typeTopic)

  topics.forEach((topic, topicIndex) => {
    TOPIC_PLAYBOOKS[topic]
      .filter((action) => !action.needs || mentions(action.needs, corpus))
      .forEach((action, index) => candidates.push(toCandidate(action, 65 - topicIndex * 10 - index)))
  })

  const described = (context.caseDescription ?? '').trim().length > 40

  candidates.push({
    id: 'start-summary',
    label: described ? 'Summarize this case' : 'Where do I stand?',
    prompt: described
      ? 'Summarize the key facts, the legal issues, and the deadlines of this case.'
      : 'Here is my situation — tell me what my legal issue is, what my options are, and what I should do first.',
    icon: 'sparkles',
    score: 40,
  })

  candidates.push({
    id: 'start-plan',
    label: 'Plan the next steps',
    prompt: 'Give me a step-by-step plan for this case, with who to approach and the deadlines to watch.',
    icon: 'checklist',
    score: 35,
  })

  candidates.push({
    id: 'start-needs',
    label: 'What do you need from me?',
    prompt: 'What facts and documents do you need from me before you can help with this case?',
    icon: 'help',
    score: 30,
  })

  return candidates
}

/** Starters for the plain chat page, drawn from the onboarding profile. */
const USE_CASE_STARTERS: Record<string, Action> = {
  personal_dispute: {
    id: 'kyc-dispute',
    label: 'Sort out my dispute',
    prompt: 'Here is my situation — tell me what my legal options are and what I should do first.',
    icon: 'scale',
  },
  own_transaction: {
    id: 'kyc-transaction',
    label: 'Check my transaction',
    prompt: 'I am about to enter into a transaction. What documents do I need, and what should I watch out for?',
    icon: 'checklist',
  },
  client_work: {
    id: 'kyc-client',
    label: 'Research for a client matter',
    prompt: 'Find the controlling law and Supreme Court doctrine on this issue, with citations I can quote.',
    icon: 'search',
  },
  legal_research: {
    id: 'kyc-research',
    label: 'Research an issue',
    prompt: 'Explain the controlling rule on this issue and cite the statute and cases that settle it.',
    icon: 'search',
  },
  government_transaction: {
    id: 'kyc-government',
    label: 'Handle a government transaction',
    prompt: 'What are the requirements, fees, and steps for this government transaction, and how long does it usually take?',
    icon: 'landmark',
  },
  agrarian_land: {
    id: 'kyc-agrarian',
    label: 'Land and agrarian questions',
    prompt: 'Explain my rights over this land under agrarian reform law, and what documents prove them.',
    icon: 'landmark',
  },
  learning: {
    id: 'kyc-learning',
    label: 'Learn a legal concept',
    prompt: 'Explain this area of Philippine law in plain terms, with an everyday example.',
    icon: 'sparkles',
  },
}

const DOCUMENT_STARTERS: Record<string, Action> = {
  demand_letter: {
    id: 'doc-demand',
    label: 'Draft a demand letter',
    prompt: 'Draft a formal demand letter for my situation, with a clear deadline for compliance.',
    icon: 'file',
  },
  contract: {
    id: 'doc-contract',
    label: 'Draft or review a contract',
    prompt: 'Draft an agreement covering these terms, and flag the clauses I should be careful about.',
    icon: 'file',
  },
  deed: {
    id: 'doc-deed',
    label: 'Prepare a deed',
    prompt: 'Prepare the deed for this transaction and list the taxes, fees, and offices involved in registering it.',
    icon: 'file',
  },
  affidavit: {
    id: 'doc-affidavit',
    label: 'Draft an affidavit',
    prompt: 'Draft an affidavit covering these facts, in the form required for notarization.',
    icon: 'file',
  },
  government_letter: {
    id: 'doc-govletter',
    label: 'Write to a government office',
    prompt: 'Draft a letter to the government office handling my request, in the format they expect.',
    icon: 'landmark',
  },
  complaint: {
    id: 'doc-complaint',
    label: 'Prepare a complaint',
    prompt: 'Prepare the complaint for filing based on these facts, and list the annexes it needs.',
    icon: 'file',
  },
  power_of_attorney: {
    id: 'doc-poa',
    label: 'Draft a power of attorney',
    prompt: 'Draft a Special Power of Attorney for this purpose, and tell me how it must be notarized.',
    icon: 'file',
  },
  lease: {
    id: 'doc-lease',
    label: 'Draft a lease',
    prompt: 'Draft a lease agreement for this property, with the terms a Philippine lease should contain.',
    icon: 'file',
  },
}

function chatStarters(context: SuggestionContext): Candidate[] {
  const candidates: Candidate[] = []

  const useCase = USE_CASE_STARTERS[context.useCase ?? '']
  if (useCase) candidates.push(toCandidate(useCase, 90))

  ;(context.documentTypes ?? []).slice(0, 2).forEach((type, index) => {
    const action = DOCUMENT_STARTERS[type]
    if (action) candidates.push(toCandidate(action, 80 - index))
  })

  if (context.role === 'law_student') {
    candidates.push({
      id: 'role-student',
      label: 'Summarize a ruling',
      prompt: 'Summarize a Supreme Court decision for me: give the facts, the issue, the ruling, and the doctrine.',
      icon: 'scale',
      score: 75,
    })
  }

  const recent = (context.recentThreadTitles ?? []).find((title) => title && title.trim().length > 0)
  if (recent) {
    candidates.push({
      id: 'resume-thread',
      label: `Continue: ${clip(recent, 30)}`,
      prompt: `Let's continue where we left off on "${recent}". Remind me where we stopped and what the next step is.`,
      icon: 'sparkles',
      score: 60,
    })
  }

  candidates.push(
    {
      id: 'chat-law',
      label: 'Ask about a law',
      prompt: 'Explain what this law requires and how it applies to an ordinary person, with citations.',
      icon: 'scale',
      score: 30,
    },
    {
      id: 'chat-ruling',
      label: 'Summarize a ruling',
      prompt: 'Summarize the ruling in G.R. No. 143491.',
      icon: 'search',
      score: 25,
    },
    {
      id: 'chat-documents',
      label: 'Use my documents',
      prompt: 'Read my uploaded documents and tell me what legal issues they raise.',
      icon: 'file',
      score: 20,
    },
  )

  return candidates
}

/**
 * The "first steps" offered on an empty thread. A case thread starts from the
 * case record and its open tasks; the plain chat page starts from the
 * onboarding profile and recent threads.
 */
export function useStarterSuggestions(context: Ref<SuggestionContext>, limit = 3) {
  const starters = computed<Suggestion[]>(() => {
    const value = context.value
    const candidates = value.caseTitle ? caseStarters(value) : chatStarters(value)

    return rank(candidates, [], limit)
  })

  return { starters }
}
