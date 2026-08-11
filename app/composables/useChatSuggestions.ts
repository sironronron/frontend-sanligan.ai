import type { ChatMessage } from '~/types/chat'

export interface Suggestion {
  label: string
  prompt: string
  icon?: string
}

function detectCasePhase(content: string): string {
  const lower = content.toLowerCase()

  if (lower.includes('draft') || lower.includes('letter') || lower.includes('correspondence') || lower.includes('complaint')) {
    return 'drafting'
  }
  if (lower.includes('demand') || lower.includes('payment') || lower.includes('compensation') || lower.includes('settlement')) {
    return 'demand'
  }
  if (lower.includes('deadline') || lower.includes('filing') || lower.includes('prescript') || lower.includes('reglementary')) {
    return 'deadline_critical'
  }
  if (lower.includes('research') || lower.includes('statute') || lower.includes('law') || lower.includes('republic act') || lower.includes('jurisprudence')) {
    return 'research'
  }
  if (lower.includes('summarize') || lower.includes('overview') || lower.includes('facts')) {
    return 'analysis'
  }
  if (lower.includes('evidence') || lower.includes('document') || lower.includes('proof') || lower.includes('affidavit')) {
    return 'evidence'
  }
  if (lower.includes('court') || lower.includes('hearing') || lower.includes('trial') || lower.includes('proceeding')) {
    return 'litigation'
  }
  if (lower.includes('compliance') || lower.includes('regulation') || lower.includes('requirement') || lower.includes('permit')) {
    return 'compliance'
  }

  return 'general'
}

function detectTopics(content: string): string[] {
  const lower = content.toLowerCase()
  const topics: string[] = []

  if (lower.includes('eminent domain') || lower.includes('expropriation') || lower.includes('condemnation')) {
    topics.push('eminent_domain')
  }
  if (lower.includes('labor') || lower.includes('employee') || lower.includes('dismissal') || lower.includes('separation')) {
    topics.push('labor')
  }
  if (lower.includes('debt') || lower.includes('collection') || lower.includes('obligation') || lower.includes('payment')) {
    topics.push('debt_collection')
  }
  if (lower.includes('land') || lower.includes('property') || lower.includes('real estate') || lower.includes('title')) {
    topics.push('property')
  }
  if (lower.includes('contract') || lower.includes('agreement') || lower.includes('terms')) {
    topics.push('contract')
  }
  if (lower.includes('tax') || lower.includes('assessment') || lower.includes('revenue')) {
    topics.push('tax')
  }
  if (lower.includes('family') || lower.includes('custody') || lower.includes('annulment') || lower.includes('divorce')) {
    topics.push('family')
  }
  if (lower.includes('criminal') || lower.includes('complaint') || lower.includes('charges')) {
    topics.push('criminal')
  }

  return topics
}

function detectAlreadyDiscussed(content: string): string[] {
  const lower = content.toLowerCase()
  const discussed: string[] = []

  if (lower.includes('demand letter') || lower.includes('demand for payment')) {
    discussed.push('demand_letter')
  }
  if (lower.includes('complaint') || lower.includes('filed a case')) {
    discussed.push('complaint')
  }
  if (lower.includes('settlement') || lower.includes('negotiate') || lower.includes('compromise')) {
    discussed.push('settlement')
  }
  if (lower.includes('motion') || lower.includes('filed a motion')) {
    discussed.push('motion')
  }
  if (lower.includes('affidavit') || lower.includes('sworn statement')) {
    discussed.push('affidavit')
  }
  if (lower.includes('position paper') || lower.includes('memorandum')) {
    discussed.push('position_paper')
  }

  return discussed
}

function generatePhaseBasedActions(phase: string, topics: string[], discussed: string[]): Suggestion[] {
  const suggestions: Suggestion[] = []

  if (phase === 'drafting') {
    if (!discussed.includes('demand_letter')) {
      suggestions.push({
        label: 'Draft a demand letter',
        prompt: 'Help me draft a formal demand letter for this matter.',
      })
    }
    if (!discussed.includes('position_paper')) {
      suggestions.push({
        label: 'Prepare a position paper',
        prompt: 'Help me prepare a position paper outlining our legal arguments.',
      })
    }
    suggestions.push({
      label: 'Review and formalize',
      prompt: 'Please review this draft and formalize it into a professional document.',
    })
  } else if (phase === 'demand') {
    suggestions.push({
      label: 'Draft demand letter',
      prompt: 'Help me draft a formal demand letter based on these facts.',
    })
    if (topics.includes('debt_collection')) {
      suggestions.push({
        label: 'Calculate interest owed',
        prompt: 'Calculate the legal interest owed on the outstanding amount.',
      })
    }
    suggestions.push({
      label: 'Set deadline for response',
      prompt: 'What deadline should I set for their response, and what are the legal consequences of non-compliance?',
    })
  } else if (phase === 'deadline_critical') {
    suggestions.push({
      label: 'List all deadlines',
      prompt: 'List all critical deadlines and their consequences in a table format.',
    })
    suggestions.push({
      label: 'Prioritize actions',
      prompt: 'Based on these deadlines, what actions should I prioritize and in what order?',
    })
    suggestions.push({
      label: 'Prepare filings',
      prompt: 'Help me prepare the necessary filings to meet these deadlines.',
    })
  } else if (phase === 'research') {
    if (topics.includes('eminent_domain')) {
      suggestions.push({
        label: 'Research just compensation cases',
        prompt: 'Find Supreme Court cases on just compensation and fair market value in eminent domain.',
      })
      suggestions.push({
        label: 'Calculate interest on delay',
        prompt: 'Calculate the legal interest owed for the delay in payment based on applicable jurisprudence.',
      })
    } else {
      suggestions.push({
        label: 'Find related cases',
        prompt: 'Find Supreme Court cases that support our position on this issue.',
      })
      suggestions.push({
        label: 'Compare with similar laws',
        prompt: 'How does this compare with similar laws or regulations that might apply?',
      })
    }
    suggestions.push({
      label: 'Summarize legal basis',
      prompt: 'Summarize the key legal provisions that support our position.',
    })
  } else if (phase === 'analysis') {
    suggestions.push({
      label: 'Identify legal issues',
      prompt: 'Identify the specific legal issues and causes of action in this case.',
    })
    suggestions.push({
      label: 'Assess case strength',
      prompt: 'Assess the strengths and weaknesses of our legal position.',
    })
    suggestions.push({
      label: 'Outline case strategy',
      prompt: 'Outline the recommended strategy for handling this case.',
    })
  } else if (phase === 'evidence') {
    suggestions.push({
      label: 'List required evidence',
      prompt: 'What specific documents and evidence do we need to support this case?',
    })
    suggestions.push({
      label: 'Prepare evidence checklist',
      prompt: 'Create a checklist of all evidence needed with deadlines for gathering them.',
    })
    suggestions.push({
      label: 'Draft supporting documents',
      prompt: 'Help me draft the supporting documents needed for this evidence.',
    })
  } else if (phase === 'litigation') {
    suggestions.push({
      label: 'Prepare for hearing',
      prompt: 'What should I prepare and expect for the upcoming hearing?',
    })
    suggestions.push({
      label: 'Outline arguments',
      prompt: 'Outline the key arguments to present in court.',
    })
    suggestions.push({
      label: 'Draft court submissions',
      prompt: 'Help me draft the necessary court submissions and memoranda.',
    })
  } else if (phase === 'compliance') {
    suggestions.push({
      label: 'Check requirements',
      prompt: 'What are the specific compliance requirements and deadlines I need to meet?',
    })
    suggestions.push({
      label: 'Prepare compliance docs',
      prompt: 'Help me prepare the required compliance documentation.',
    })
  } else {
    // General - analyze then act
    suggestions.push({
      label: 'Identify next steps',
      prompt: 'Based on our discussion, what are the concrete next steps I should take?',
    })
    suggestions.push({
      label: 'Draft correspondence',
      prompt: 'Help me draft any necessary correspondence for this matter.',
    })
    suggestions.push({
      label: 'Research applicable law',
      prompt: 'What specific laws and regulations apply to this situation?',
    })
  }

  return suggestions.slice(0, 3)
}

function generateContextualActions(content: string, topics: string[], discussed: string[]): Suggestion[] {
  const suggestions: Suggestion[] = []
  const lower = content.toLowerCase()

  // Eminent domain specific
  if (topics.includes('eminent_domain')) {
    if (lower.includes('just compensation') && !discussed.includes('demand_letter')) {
      suggestions.push({
        label: 'Draft demand for just compensation',
        prompt: 'Help me draft a formal demand letter to DPWH for just compensation with interest.',
      })
    }
    if (lower.includes('zonal value') || lower.includes('fair market value')) {
      suggestions.push({
        label: 'Research valuation methods',
        prompt: 'What valuation methods does the court accept for determining fair market value in expropriation cases?',
      })
    }
    if (lower.includes('interest') || lower.includes('delay')) {
      suggestions.push({
        label: 'Calculate total damages',
        prompt: 'Calculate the total amount owed including just compensation, interest, and consequential damages.',
      })
    }
  }

  // Labor specific
  if (topics.includes('labor')) {
    if (lower.includes('dismissal') || lower.includes('terminated')) {
      suggestions.push({
        label: 'File labor complaint',
        prompt: 'Help me prepare and file a complaint for illegal dismissal with the NLRC.',
      })
      suggestions.push({
        label: 'Calculate backwages',
        prompt: 'Calculate the backwages and other monetary benefits owed.',
      })
    }
  }

  // Debt collection specific
  if (topics.includes('debt_collection')) {
    if (lower.includes('demand') && !discussed.includes('demand_letter')) {
      suggestions.push({
        label: 'Send formal demand',
        prompt: 'Help me draft and send a formal demand letter with a deadline for payment.',
      })
    }
    if (lower.includes('interest')) {
      suggestions.push({
        label: 'Compute total amount due',
        prompt: 'Compute the total amount due including principal, interest, and penalties.',
      })
    }
  }

  // Property specific
  if (topics.includes('property')) {
    if (lower.includes('title') || lower.includes('ownership')) {
      suggestions.push({
        label: 'Verify title status',
        prompt: 'Help me verify the title status and identify any encumbrances or issues.',
      })
    }
  }

  return suggestions.slice(0, 3)
}

export function useChatSuggestions(
  messages: Ref<ChatMessage[]>,
  experienceLevel: Ref<string | null>,
  streaming: Ref<boolean>,
) {
  const suggestions = computed<Suggestion[]>(() => {
    if (streaming.value) return []
    if (messages.value.length === 0) return []
    if (experienceLevel.value !== 'beginner' && experienceLevel.value !== 'intermediate') return []

    const lastAssistant = [...messages.value]
      .reverse()
      .find((m) => m.role === 'assistant')

    if (!lastAssistant || !lastAssistant.content) return []

    const phase = detectCasePhase(lastAssistant.content)
    const topics = detectTopics(lastAssistant.content)
    const discussed = detectAlreadyDiscussed(lastAssistant.content)

    // First try contextual actions based on specific topics
    const contextual = generateContextualActions(lastAssistant.content, topics, discussed)
    if (contextual.length > 0) return contextual

    // Fall back to phase-based actions
    return generatePhaseBasedActions(phase, topics, discussed)
  })

  return { suggestions }
}
