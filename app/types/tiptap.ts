/**
 * Minimal structural types for the Tiptap/ProseMirror JSON documents the
 * letter editor round-trips. Everything here is deliberately loose — the
 * editor tolerates arbitrary node types — but the shapes the app itself
 * emits are the ones these types describe.
 */

export type TiptapMarkType = 'bold' | 'italic'

export interface TiptapMark {
  type: TiptapMarkType
}

export interface TiptapNode {
  type: string
  attrs?: Record<string, unknown>
  content?: TiptapNode[]
  text?: string
  marks?: TiptapMark[]
}

export interface TiptapDoc {
  type: 'doc'
  content: TiptapNode[]
}

export interface SignatureAttributes {
  src: string | null
  signedAt: string | null
  signerName: string | null
  width: number | null
  height: number | null
  /** Horizontal placement of the signature block: left, center, or right. */
  align: SignatureAlign
  /**
   * Where the signature was dragged to across its line, as a percentage of the
   * line's width for its left edge. Null when it has never been dragged, in
   * which case `align` decides. Stored as a percentage so the placement holds
   * across panel widths and export page sizes.
   */
  offsetX: number | null
}

export type SignatureAlign = 'left' | 'center' | 'right'

export interface LetterDraft {
  id: string
  user_id: string
  title: string
  content_json: TiptapDoc
  status: 'draft' | 'finalized'
  created_at: string
  updated_at: string
}

export interface SignedSignature {
  src: string
  signedAt: string
  signerName: string
  width: number
  height: number
}

/**
 * A letter produced through the chat's `draft_letter` tool, ready to drop into
 * the letter editor panel. The server's persisted copy also carries a `raw`
 * field; the editor only needs the sanitized document and its title.
 *
 * `content` is null while the tool is still drafting — the panel opens early
 * on the `draft_letter` tool call and fills in when `letter_draft` arrives.
 * `messageId` is the assistant message the letter will be persisted on, which
 * saving edits back needs.
 */
export interface LetterDraftPayload {
  content: TiptapDoc | null
  title: string | null
  messageId?: string | null
  drafting?: boolean
}

/**
 * A comment pinned to a single block of a drafted letter. `block_id` is the
 * stable identifier the editor stamps on every paragraph, heading, or list
 * item, so the comment stays attached to the section across edits. `replies`
 * is the nested thread beneath a root comment.
 */
export interface LetterComment {
  id: string
  message_id: string
  block_id: string
  parent_id: string | null
  body: string
  created_at: string
  updated_at: string
  user: {
    id: string
    name: string | null
    email: string
  }
  replies: LetterComment[]
}

export interface LetterCommentInput {
  block_id: string
  body: string
  parent_id?: string | null
}