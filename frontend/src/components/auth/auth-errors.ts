/**
 * One reading of every way an auth form can fail: a ZodError from the client's own validation (field-level
 * messages), an ApiError from the server (422 fields, 429 with how long to wait, 5xx), or a dropped connection.
 * The same mistake then reads the same on sign in, create account, forgot password and reset password.
 */

export type FormFailure = {
  /** What to say once, in plain words. */
  message: string
  /** Messages for single fields, keyed by the API field name (email, password, new_password). */
  fields: Partial<Record<string, string>>
  /** Seconds until the same request is worth repeating (429 only). Absent when the server did not say. */
  retryAfter?: number
  kind: 'rate-limit' | 'server' | 'offline' | 'validation' | 'other'
}

const UNIT_SECONDS: Record<string, number> = { second: 1, minute: 60, hour: 3600 }

/** "5 per 1 minute" (the limiter's wording) to 60. A conservative reading: the whole window. */
function windowSeconds(text: string): number | undefined {
  const match = /per\s+(\d+)\s+(second|minute|hour)/i.exec(text)
  if (!match) return undefined
  return Number(match[1]) * UNIT_SECONDS[match[2].toLowerCase()]
}

export function formatWait(seconds: number): string {
  // A no-break space keeps the number and its unit together on a narrow line.
  if (seconds < 90) return `${seconds}\u00a0s`
  const minutes = Math.round(seconds / 60)
  return minutes === 1 ? '1 minute' : `${minutes} minutes`
}

const FIELD_MESSAGES: Record<string, string> = {
  email: 'Enter a valid email address.',
}

function isZodError(error: unknown): error is { issues: Array<{ path: PropertyKey[]; message: string }> } {
  return Boolean(error) && typeof error === 'object' && Array.isArray((error as { issues?: unknown }).issues)
}

function rateLimit(retryAfter: number | undefined): FormFailure {
  return {
    kind: 'rate-limit',
    fields: {},
    retryAfter,
    message: retryAfter
      ? `Too many attempts. Try again in ${formatWait(retryAfter)}.`
      : 'Too many attempts. Wait a minute, then try again.',
  }
}

export function describeFailure(error: unknown, fallback = 'Something went wrong. Please try again.'): FormFailure {
  if (isZodError(error)) {
    const fields: FormFailure['fields'] = {}
    let first = ''
    for (const issue of error.issues) {
      const field = String(issue.path[0] ?? '')
      const message = FIELD_MESSAGES[field] ?? issue.message
      if (field && !fields[field]) fields[field] = message
      first ||= message
    }
    return { kind: 'validation', fields, message: first || fallback }
  }

  if (typeof error === 'string') {
    if (/rate limit exceeded/i.test(error)) return rateLimit(windowSeconds(error))
    return { kind: 'other', fields: {}, message: error || fallback }
  }

  if (error instanceof Error) {
    const status = (error as { status?: number }).status
    const detail = (error as { detail?: string }).detail ?? ''
    const retryAfter = (error as { retryAfter?: number }).retryAfter
    if (status === 429) return rateLimit(typeof retryAfter === 'number' ? retryAfter : windowSeconds(`${detail} ${error.message}`))
    if (typeof status === 'number' && status >= 500) {
      return { kind: 'server', fields: {}, message: 'Something went wrong on our side. Try again in a moment.' }
    }
    if (status === 422) {
      const unreadable = !error.message || /\[object Object\]/.test(error.message)
      return {
        kind: 'validation',
        fields: {},
        message: unreadable ? 'Some details need another look. Check the fields and try again.' : error.message,
      }
    }
    if (error instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false && status === undefined)) {
      return { kind: 'offline', fields: {}, message: "Can't reach the server. Check your connection and try again." }
    }
    if (/rate limit exceeded/i.test(error.message)) return rateLimit(windowSeconds(error.message))
    return { kind: 'other', fields: {}, message: error.message || fallback }
  }

  return { kind: 'other', fields: {}, message: fallback }
}
