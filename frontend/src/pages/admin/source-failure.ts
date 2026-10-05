const STATUS_REASONS: Record<number, string> = {
  400: 'the board rejected the request',
  401: 'the board wants a login',
  403: 'the board refused access',
  404: 'board not found',
  410: 'the board no longer exists',
  429: 'the board is rate limiting us',
}

/** The exception classes the ingestion run records ("failed: ReadTimeout"), in words an operator can act on. */
const CLASS_REASONS: Array<[RegExp, string]> = [
  [/Timeout/i, 'The board did not answer in time'],
  [/Connect|Network|DNS|SSL|TLS/i, 'The board could not be reached'],
  [/JSON|Decode|Parse|Value|Key|Type/i, 'The board answered with data we could not read'],
  [/HTTPStatus/i, 'The board answered with an error'],
]

/**
 * A failed fetch in plain words. The backend stores the exception class ("failed: HTTPStatusError"), and a status
 * code when the outcome carries one ("failed: HTTPStatusError 404"). Returns null for an outcome that did not fail.
 */
export function describeFailure(outcome: string | null | undefined): string | null {
  if (!outcome || outcome === 'ok') return null
  const status = /\b([1-5]\d\d)\b/.exec(outcome)
  if (status) {
    const code = Number(status[1])
    const reason = STATUS_REASONS[code] ?? (code >= 500 ? "the board's server is having trouble" : 'unexpected answer from the board')
    return `${code} - ${reason}`
  }
  const name = outcome.replace(/^failed:\s*/i, '')
  for (const [pattern, reason] of CLASS_REASONS) if (pattern.test(name)) return reason
  return 'The fetch failed'
}
