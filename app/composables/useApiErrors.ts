export interface ParsedApiError {
  /** Message for the form-level alert. Empty when every error is field-level. */
  message: string
  /** First validation message per field, keyed by the API's field name. */
  fields: Record<string, string>
  status: number | null
}

/**
 * Normalise a thrown $fetch error into something a form can render.
 *
 * Laravel answers a failed validation with 422 and `{ message, errors }`, where
 * `message` merely repeats the first field error — showing both would say the
 * same thing twice, so the form-level message is dropped when fields are present.
 */
export function parseApiError(error: unknown, fallback = 'Something went wrong. Please try again.'): ParsedApiError {
  const failure = error as {
    status?: number
    statusCode?: number
    data?: { message?: string, errors?: Record<string, string[] | string> }
  } | undefined

  const status = failure?.status ?? failure?.statusCode ?? null
  const fields: Record<string, string> = {}

  for (const [field, messages] of Object.entries(failure?.data?.errors ?? {})) {
    const first = Array.isArray(messages) ? messages[0] : messages
    if (typeof first === 'string' && first !== '') fields[field] = first
  }

  // Both auth routes are rate limited, and the throttle response carries no
  // body worth showing.
  if (status === 429) {
    return { status, fields: {}, message: 'Too many attempts. Please wait a minute and try again.' }
  }

  if (status === 0 || status === undefined || status === null) {
    return { status, fields, message: 'Could not reach the server. Check your connection and try again.' }
  }

  return {
    status,
    fields,
    message: Object.keys(fields).length > 0 ? '' : (failure?.data?.message ?? fallback),
  }
}
