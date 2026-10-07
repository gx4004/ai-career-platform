/**
 * Every way a request can fail, read once. apiErrorFromResponse, apiErrorFromZod and networkErrorFrom build
 * an ApiError whose message is already a sentence a person can read; describeFailure turns anything a form
 * can catch into the same shape (message, field messages, how long to wait).
 */

export type ErrorKind = 'validation' | 'rate-limit' | 'server' | 'offline' | 'other'

export class ApiError extends Error {
  /** HTTP status; 0 when no response arrived (offline, timeout). */
  status: number

  /** The server's own words, when it sent a readable sentence. */
  detail?: string

  /** Seconds until the same request is worth repeating (429, a busy 503). */
  retryAfter?: number

  /** Messages for single fields, keyed by the API field name. */
  fields: Record<string, string>

  constructor(
    message: string,
    status = 500,
    detail?: string,
    options: { retryAfter?: number; fields?: Record<string, string>; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.retryAfter = options.retryAfter
    this.fields = options.fields ?? {}
  }
}

export type FormFailure = {
  /** What to say once, in plain words. */
  message: string
  /** Messages for single fields, keyed by the API field name (email, password, new_password). */
  fields: Partial<Record<string, string>>
  /** Seconds until the same request is worth repeating (429 only). Absent when the server did not say. */
  retryAfter?: number
  kind: ErrorKind
}

const COPY = {
  offline: "Can't reach the server. Check your connection and try again.",
  timeout: 'The server took too long to answer. Try again in a moment.',
  server: 'Something went wrong on our side. Try again in a moment.',
  unavailable: 'The service is temporarily unavailable. Try again in a moment.',
  validation: 'Some details need another look. Check the fields and try again.',
  other: 'Something went wrong. Please try again.',
} as const

const UNIT_SECONDS: Record<string, number> = { second: 1, minute: 60, hour: 3600 }

/** "5 per 1 minute" (the limiter's wording) to 60. A conservative reading: the whole window. */
function windowSeconds(text: string): number | undefined {
  const match = /per\s+(\d+)\s+(second|minute|hour)/i.exec(text)
  if (!match) return undefined
  return Number(match[1]) * UNIT_SECONDS[match[2].toLowerCase()]
}

export function formatWait(seconds: number): string {
  // A no-break space keeps the number and its unit together on a narrow line.
  if (seconds < 90) return `${seconds} s`
  const minutes = Math.round(seconds / 60)
  return minutes === 1 ? '1 minute' : `${minutes} minutes`
}

function rateLimitMessage(retryAfter: number | undefined): string {
  return retryAfter
    ? `Too many attempts. Try again in ${formatWait(retryAfter)}.`
    : 'Too many attempts. Wait a minute, then try again.'
}

// Strings that are a framework's, a proxy's or a browser's, not a sentence written for a person.
const RAW_PATTERNS = [
  /^\s*</,
  /^\s*[[{]/,
  /\[object Object\]/,
  /^(Internal Server Error|Bad Gateway|Service Unavailable|Gateway Time-?out|Method Not Allowed|Unprocessable (Entity|Content)|Request failed)\.?$/i,
  /Failed to fetch|NetworkError|Load failed|Failed to construct|signal (timed out|is aborted)/i,
  /^Rate limit exceeded/i,
]

function isReadable(text: string | undefined | null): text is string {
  if (!text) return false
  const trimmed = text.trim()
  return Boolean(trimmed) && trimmed.length <= 300 && !RAW_PATTERNS.some((pattern) => pattern.test(trimmed))
}

/**
 * The server's words as a sentence: trimmed, with a full stop when they end without closing punctuation
 * ("Invalid email or password" reads like every other message the forms write). A link or a path ending in
 * "/" is left alone so it is never broken by a stray stop.
 */
function asSentence(text: string): string {
  const trimmed = text.trim()
  return /[\p{L}\p{N})"'\u201D\u2019]$/u.test(trimmed) ? `${trimmed}.` : trimmed
}

/** The password rules in plain words: bcrypt's 72-byte bound and the UTF-8 check (client schema and server alike). */
export const PASSWORD_COPY = {
  tooLong: 'Use at most 72 characters (fewer with accents or emoji).',
  encoding: 'Use only standard characters.',
} as const

/** Pydantic's and our server's own wording for a rule, said the way the client's checks say it. */
const SERVER_PHRASES: ReadonlyArray<readonly [RegExp, (match: RegExpExecArray) => string]> = [
  [/^String should have at (least|most) (\d+) characters?$/i, (m) => `Use at ${m[1].toLowerCase()} ${m[2]} character${m[2] === '1' ? '' : 's'}.`],
  [/^Password must be at most 72 UTF-8 bytes\.?$/i, () => PASSWORD_COPY.tooLong],
  [/must be valid UTF-8\.?$/i, () => PASSWORD_COPY.encoding],
]

function plainServerPhrase(text: string): string {
  for (const [pattern, say] of SERVER_PHRASES) {
    const match = pattern.exec(text)
    if (match) return say(match)
  }
  return text
}

const FIELD_MESSAGES: Record<string, string> = {
  email: 'Enter a valid email address.',
  url: 'Enter a full link starting with https://',
}

function fieldLabel(field: string): string {
  const words = field.replace(/[_-]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : ''
}

/**
 * FastAPI's 422 list, read as one sentence per field. Input values are never echoed back (main.py strips them).
 * A field's own message shows under that field, so it does not repeat the field's name; the one-line summary
 * (`message`, for a form that has no slot for the field) keeps it ("Full name: Use at most 200 characters.").
 */
function readValidationDetail(detail: unknown[]): { message: string; fields: Record<string, string> } {
  const fields: Record<string, string> = {}
  let first = ''
  for (const item of detail) {
    if (!item || typeof item !== 'object') continue
    const { loc, msg, type } = item as { loc?: unknown; msg?: unknown; type?: unknown }
    const path = Array.isArray(loc) ? loc : []
    const field = String(
      [...path].reverse().find((part) => typeof part === 'string' && !['body', 'query', 'path', 'header', 'cookie'].includes(part)) ?? '',
    )
    const raw = (typeof msg === 'string' ? msg : '').replace(/^(Value error|Assertion failed),\s*/i, '').trim()
    const text = plainServerPhrase(raw)
    let fieldMessage: string
    let summary: string
    if (FIELD_MESSAGES[field] && /email|url/i.test(`${String(type ?? '')} ${raw}`)) {
      fieldMessage = summary = FIELD_MESSAGES[field]
    } else if (field && isReadable(text)) {
      fieldMessage = asSentence(text)
      summary = asSentence(`${fieldLabel(field)}: ${text}`)
    } else {
      fieldMessage = summary = isReadable(text) ? asSentence(text) : COPY.validation
    }
    if (field && !fields[field]) fields[field] = fieldMessage
    first ||= summary
  }
  return { message: first || COPY.validation, fields }
}

function readRetryAfter(headers: Headers | undefined | null, body: unknown): number | undefined {
  const header = headers?.get?.('Retry-After')
  if (header) {
    const seconds = Number(header)
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds)
    const date = Date.parse(header)
    if (!Number.isNaN(date)) return Math.max(1, Math.ceil((date - Date.now()) / 1000))
  }
  if (body && typeof body === 'object') {
    const value = (body as Record<string, unknown>).retry_after
    if (typeof value === 'number' && value > 0) return Math.ceil(value)
  }
  return undefined
}

/** A failed response as an ApiError with a sentence. Plain-text and HTML bodies (proxy pages) are never shown. */
export function apiErrorFromResponse(status: number, parsed: unknown, headers?: Headers | null): ApiError {
  let serverText: string | undefined
  let fields: Record<string, string> = {}
  let message: string | undefined

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const body = parsed as Record<string, unknown>
    if (Array.isArray(body.detail)) {
      ;({ message, fields } = readValidationDetail(body.detail))
    } else {
      serverText = [body.detail, body.message, body.error].find((value): value is string => typeof value === 'string')
    }
  }

  let retryAfter = readRetryAfter(headers, parsed)
  if (status === 429) {
    retryAfter ??= windowSeconds(serverText ?? '')
    message = rateLimitMessage(retryAfter)
  }

  if (!message) {
    if (isReadable(serverText)) message = asSentence(serverText)
    else if (status === 502 || status === 503 || status === 504) message = COPY.unavailable
    else if (status >= 500) message = COPY.server
    else if (status === 422 || status === 400) message = COPY.validation
    else message = COPY.other
  }

  return new ApiError(message, status, isReadable(serverText) ? serverText : undefined, { retryAfter, fields })
}

type ZodLikeIssue = {
  path: PropertyKey[]
  message: string
  code?: string
  format?: string
  origin?: string
  minimum?: unknown
  maximum?: unknown
}

/**
 * Zod's own wording for a bound ("Too small: expected string to have >=8 characters"), said for a person: the
 * summary names the field ("Full name must be at most 200 characters."); under the field itself a length reads
 * like the server's ("Use at most 200 characters."), without repeating the field's name.
 */
function boundMessage(field: string, issue: ZodLikeIssue): { summary: string; field: string } {
  const label = fieldLabel(field)
  const bound =
    issue.code === 'too_small' && typeof issue.minimum === 'number'
      ? (['least', issue.minimum] as const)
      : issue.code === 'too_big' && typeof issue.maximum === 'number'
        ? (['most', issue.maximum] as const)
        : null
  if (!label || !bound) return { summary: COPY.validation, field: COPY.validation }
  const [side, limit] = bound
  if (issue.origin !== 'string') {
    const sentence = `${label} must be at ${side} ${limit}.`
    return { summary: sentence, field: sentence }
  }
  return {
    summary: `${label} must be at ${side} ${limit} characters.`,
    field: `Use at ${side} ${limit} character${limit === 1 ? '' : 's'}.`,
  }
}

/** The client's own validation, read like a server 422 would be: one sentence, field messages. */
export function apiErrorFromZod(error: { issues: ZodLikeIssue[] }): ApiError {
  const fields: Record<string, string> = {}
  let first = ''
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? '')
    const authored = !/^(Too (small|big): expected|Invalid (input|email|url|string|format))/i.test(issue.message)
    const said = authored
      ? { summary: issue.message, field: issue.message }
      : FIELD_MESSAGES[field]
        ? { summary: FIELD_MESSAGES[field], field: FIELD_MESSAGES[field] }
        : boundMessage(field, issue)
    if (field && !fields[field]) fields[field] = said.field
    first ||= said.summary
  }
  return new ApiError(first || COPY.validation, 422, undefined, { fields, cause: error })
}

/** A request that never got an answer: offline, refused, or out of time. */
export function networkErrorFrom(error: unknown): ApiError {
  const name = error && typeof error === 'object' ? (error as { name?: unknown }).name : undefined
  const message = name === 'TimeoutError' ? COPY.timeout : COPY.offline
  return new ApiError(message, 0, undefined, { cause: error })
}

// What browsers throw from fetch() when no response arrives (Chrome, Firefox, Safari).
const BROWSER_NETWORK_FAILURE = /Failed to fetch|NetworkError|Load failed|Network request failed/i

function isZodError(error: unknown): error is { issues: ZodLikeIssue[] } {
  return Boolean(error) && typeof error === 'object' && Array.isArray((error as { issues?: unknown }).issues)
}

function rateLimit(retryAfter: number | undefined): FormFailure {
  return { kind: 'rate-limit', fields: {}, retryAfter, message: rateLimitMessage(retryAfter) }
}

/** The one reading of a failure for any form: ApiError, ZodError, a dropped connection, a string. */
export function describeFailure(error: unknown, fallback: string = COPY.other): FormFailure {
  if (isZodError(error)) {
    const { message, fields } = apiErrorFromZod(error)
    return { kind: 'validation', fields: fields as FormFailure['fields'], message: message || fallback }
  }

  if (typeof error === 'string') {
    if (/rate limit exceeded/i.test(error)) return rateLimit(windowSeconds(error))
    return { kind: 'other', fields: {}, message: isReadable(error) ? error : fallback }
  }

  if (error instanceof Error) {
    const status = (error as { status?: number }).status
    const detail = (error as { detail?: string }).detail ?? ''
    const retryAfter = (error as { retryAfter?: number }).retryAfter
    const fields = ((error as { fields?: Record<string, string> }).fields ?? {}) as FormFailure['fields']
    if (status === 429) {
      return rateLimit(typeof retryAfter === 'number' ? retryAfter : windowSeconds(`${detail} ${error.message}`))
    }
    if (status === 0 && error instanceof ApiError) {
      return { kind: 'offline', fields: {}, message: isReadable(error.message) ? error.message : COPY.offline }
    }
    if ((error as { name?: unknown }).name === 'TimeoutError') return { kind: 'offline', fields: {}, message: COPY.timeout }
    if (status === 0 || (error instanceof TypeError && BROWSER_NETWORK_FAILURE.test(error.message))) {
      return { kind: 'offline', fields: {}, message: COPY.offline }
    }
    // A bug in the page ("Cannot read properties of undefined") is never worded for a person.
    if (error instanceof TypeError || error instanceof ReferenceError || error instanceof RangeError || error instanceof SyntaxError) {
      return { kind: 'other', fields: {}, message: fallback }
    }
    if (typeof status === 'number' && status >= 500) {
      return { kind: 'server', fields: {}, retryAfter, message: isReadable(error.message) ? error.message : COPY.server }
    }
    if (status === 422 || status === 400) {
      return { kind: 'validation', fields, message: isReadable(error.message) ? error.message : COPY.validation }
    }
    if (/rate limit exceeded/i.test(error.message)) return rateLimit(windowSeconds(error.message))
    return { kind: 'other', fields, message: isReadable(error.message) ? error.message : fallback }
  }

  return { kind: 'other', fields: {}, message: fallback }
}
