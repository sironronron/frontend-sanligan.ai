import type { Ref } from 'vue'
import type { LetterDraftPayload } from '~/types/tiptap'

const letterDraft = ref<LetterDraftPayload | null>(null)

/**
 * Shared state for the letter editor slide-in panel, opened the moment the
 * chat's `draft_letter` tool starts (with an empty "Drafting…" state) and
 * filled when the `letter_draft` event lands. It is also reopened from a
 * message's letter chip or the /drafts list after a reload. Any component can
 * call `openLetterDraft(draft)` to show the panel, and `closeLetterDraft()` to
 * dismiss it.
 */
export function useLetterDraftPanel() {
  function beginLetterDraft() {
    letterDraft.value = { content: null, title: null, drafting: true }
  }

  function fillLetterDraft(draft: LetterDraftPayload) {
    letterDraft.value = { ...draft, drafting: false }
  }

  function openLetterDraft(draft: LetterDraftPayload) {
    letterDraft.value = { ...draft, drafting: false }
  }

  function closeLetterDraft() {
    letterDraft.value = null
  }

  return {
    // `readonly()` freezes the payload, which is exactly what the panel needs
    // (it never mutates the incoming document). Cast back so the nested Tiptap
    // arrays stay assignable to `TiptapDoc` in templates.
    letterDraft: readonly(letterDraft) as Ref<LetterDraftPayload | null>,
    beginLetterDraft,
    fillLetterDraft,
    openLetterDraft,
    closeLetterDraft,
  }
}