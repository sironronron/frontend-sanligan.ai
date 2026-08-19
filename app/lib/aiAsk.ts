export interface AiAskAction {
  id: string
  label: string
  instruction: string
}

export const AI_ASK_ACTIONS: AiAskAction[] = [
  { id: 'rewrite', label: 'Rewrite', instruction: 'Rewrite this text clearly and naturally while keeping its meaning exactly the same.' },
  { id: 'formal', label: 'Make formal', instruction: 'Rewrite this in a firm, formal legal-letter tone while keeping every fact unchanged.' },
  { id: 'concise', label: 'Make concise', instruction: 'Rewrite this more concisely, cutting redundancy without losing any fact or point.' },
  { id: 'grammar', label: 'Fix grammar', instruction: 'Fix the grammar, spelling, and punctuation. Do not change the meaning.' },
  { id: 'friendly', label: 'Soften the tone', instruction: 'Rewrite this in a more polite, conciliatory tone while keeping every fact unchanged.' },
]

/** The default action, and the fallback for an id that no longer exists. */
const DEFAULT_ACTION = AI_ASK_ACTIONS[0]!

export function aiActionInstruction(id: string): string {
  return AI_ASK_ACTIONS.find((action) => action.id === id)?.instruction ?? DEFAULT_ACTION.instruction
}

/** The human name of an action, for the label on the suggestion panel. */
export function aiActionLabel(id: string): string {
  return AI_ASK_ACTIONS.find((action) => action.id === id)?.label ?? DEFAULT_ACTION.label
}