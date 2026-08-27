/**
 * Maps a login/auth failure to a user-facing message.
 *
 * Previously every login exception became "Invalid email or password." — so a
 * network outage, a 500, a locked account, or a rate-limit all looked like wrong
 * credentials, and users kept retrying credentials that were actually correct.
 *
 * Strategy: surface the backend's own message when it provides one; otherwise
 * fall back to a status-specific message; a missing HTTP status means the request
 * never reached the server (connection error). Works with ofetch / Nuxt $fetch
 * errors, which expose `.statusCode`, `.data`, and `.response`.
 */
export function loginErrorMessage (e: any): string {
  const backend: string | undefined = e?.data?.message || e?.data?.msg
  const status: number | undefined = e?.statusCode ?? e?.response?.status ?? e?.status

  // No HTTP status → the request never completed (offline, DNS, CORS, aborted).
  if (!status) {
    return 'Connection error. Please check your internet connection and try again.'
  }

  switch (status) {
    case 400:
    case 401:
    case 422:
      return backend || 'Invalid email or password.'
    case 403:
      return backend || 'Your account doesn’t have access. Please contact support.'
    case 423:
      return backend || 'Your account is locked. Reset your password or contact support.'
    case 429:
      return backend || 'Too many attempts. Please wait a moment and try again.'
    default:
      if (status >= 500) {
        return backend || 'Something went wrong on our end. Please try again shortly.'
      }
      // Any other status (e.g. an MFA-required signal): trust the backend copy.
      return backend || 'Unable to log in. Please try again.'
  }
}

/**
 * Maps a Google / social sign-in failure to a user-facing message.
 *
 * Replaces the old catch-all "Invalid User" — which hid network errors,
 * already-registered accounts, server errors, and cancellations behind one
 * confusing string. Surfaces the backend message when present, otherwise a
 * status-specific fallback.
 */
export function socialLoginErrorMessage (e: any): string {
  const backend: string | undefined = e?.data?.message || e?.data?.msg || e?.message
  const status: number | undefined = e?.statusCode ?? e?.response?.status ?? e?.status

  if (!status) {
    // No HTTP status: either a dropped connection or the Google SDK failing
    // before a request was made.
    return 'Connection error. Please check your internet connection and try again.'
  }

  switch (status) {
    case 401:
    case 403:
      return backend || 'We couldn’t sign you in with Google. Please try again or use email.'
    case 409:
      return backend || 'An account with this email already exists. Please log in with your email and password.'
    case 429:
      return backend || 'Too many attempts. Please wait a moment and try again.'
    default:
      if (status >= 500) {
        return backend || 'Something went wrong on our end. Please try again shortly.'
      }
      return backend || 'We couldn’t sign you in with Google. Please try again.'
  }
}
