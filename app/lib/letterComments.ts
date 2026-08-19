import type { LetterComment, LetterCommentInput } from '~/types/tiptap'

/**
 * Client for the letter-comment API. Comments are scoped to a draft message and
 * anchored to a block of the document, and are readable/writable by anyone who
 * can open the draft — including the lawyer vetting or notarizing it.
 */

interface LetterCommentListResponse {
  data: LetterComment[]
}

interface LetterCommentResponse {
  data: LetterComment
}

export function fetchLetterComments(messageId: string): Promise<LetterCommentListResponse> {
  const api = useApi()
  return api<LetterCommentListResponse>(`/messages/${messageId}/comments`)
}

export function createLetterComment(
  messageId: string,
  input: LetterCommentInput,
): Promise<LetterCommentResponse> {
  const api = useApi()
  return api<LetterCommentResponse>(`/messages/${messageId}/comments`, {
    method: 'POST',
    body: input,
  })
}

export function deleteLetterComment(messageId: string, commentId: string): Promise<{ message: string }> {
  const api = useApi()
  return api<{ message: string }>(`/messages/${messageId}/comments/${commentId}`, {
    method: 'DELETE',
  })
}
