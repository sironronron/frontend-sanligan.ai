import { AuthError } from '@supabase/supabase-js'

export interface ParsedApiError {
  /** Message for the form-level alert. Empty when every error is field-level. */
  message: string
  /** First validation message per field, keyed by the API's field name. */
  fields: Record<string, string>
  status: number | null
}

/**
 * Supabase Auth reports failures as a short machine code plus a terse message
 * ("Invalid login credentials"), which is accurate but tells the user nothing
 * about what to do next. Each known code is mapped to a message that names the
 * problem and, where the problem belongs to one input, the field to attach it
 * to.
 *
 * Sign-in failures are deliberately not distinguished from unknown-account
 * failures: saying which half was wrong tells an attacker which addresses are
 * registered.
 */
const AUTH_ERRORS: Record<string, { message: string, field?: string }> = {
  invalid_credentials: {
    message: 'That email and password do not match an account. Check both and try again.',
  },
  email_not_confirmed: {
    message: 'Confirm your email address first — open the link we sent you, then sign in.',
  },
  user_not_found: {
    message: 'That email and password do not match an account. Check both and try again.',
  },
  email_exists: {
    message: 'An account with this email already exists. Sign in instead.',
    field: 'email',
  },
  user_already_exists: {
    message: 'An account with this email already exists. Sign in instead.',
    field: 'email',
  },
  email_address_invalid: {
    message: 'Enter a valid email address.',
    field: 'email',
  },
  weak_password: {
    message: 'Choose a stronger password — use at least 8 characters, mixing letters and numbers.',
    field: 'password',
  },
  same_password: {
    message: 'Choose a password you have not used on this account before.',
    field: 'password',
  },
  signup_disabled: {
    message: 'New sign-ups are currently closed. Contact your administrator for an invitation.',
  },
  email_provider_disabled: {
    message: 'Email and password sign-in is not enabled for this workspace.',
  },
  over_request_rate_limit: {
    message: 'Too many attempts. Please wait a minute and try again.',
  },
  over_email_send_rate_limit: {
    message: 'Too many emails requested. Please wait a few minutes before trying again.',
  },
  session_expired: {
    message: 'Your session expired. Please sign in again.',
  },
  refresh_token_not_found: {
    message: 'Your session expired. Please sign in again.',
  },
}

function parseAuthError(error: AuthError, fallback: string): ParsedApiError {
  const known = error.code ? AUTH_ERRORS[error.code] : undefined
  const status = error.status ?? null

  if (known) {
    return known.field
      ? { status, fields: { [known.field]: known.message }, message: '' }
      : { status, fields: {}, message: known.message }
  }

  // Rate limiting is also signalled by status alone on some endpoints.
  if (status === 429) {
    return { status, fields: {}, message: 'Too many attempts. Please wait a minute and try again.' }
  }

  // An unmapped code still beats the generic fallback: Supabase's own wording
  // is at least specific to what failed.
  return { status, fields: {}, message: error.message || fallback }
}

/**
 * Normalise a thrown error into something a form can render.
 *
 * Two shapes reach here: Supabase Auth errors from the sign-in, sign-up, and
 * password flows, and Laravel API errors from everything else. Laravel answers
 * a failed validation with 422 and `{ message, errors }`, where `message`
 * merely repeats the first field error — showing both would say the same thing
 * twice, so the form-level message is dropped when fields are present.
 */
export function parseApiError(error: unknown, fallback = 'Something went wrong. Please try again.'): ParsedApiError {
  if (error instanceof AuthError) {
    return parseAuthError(error, fallback)
  }

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
    // A thrown Error with a useful message (rather than a failed request)
    // would otherwise be reported as a connection problem.
    if (error instanceof Error && error.message !== '') {
      return { status, fields, message: error.message }
    }

    return { status, fields, message: 'Could not reach the server. Check your connection and try again.' }
  }

  return {
    status,
    fields,
    message: Object.keys(fields).length > 0 ? '' : (failure?.data?.message ?? fallback),
  }
}
