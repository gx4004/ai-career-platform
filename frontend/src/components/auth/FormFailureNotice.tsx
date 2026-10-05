import { useCallback, useEffect, useState } from 'react'
import { Notice } from '#/components/kit'
import { describeFailure, formatWait, type FormFailure } from '#/components/auth/auth-errors'

/**
 * The failure of the last submit, read once by describeFailure, plus the seconds left before a rate-limited
 * request is worth repeating. The forms disable their submit while `remaining` runs.
 */
export function useFormFailure() {
  const [failure, setFailure] = useState<FormFailure | null>(null)
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    setRemaining(failure?.retryAfter ?? 0)
  }, [failure])

  useEffect(() => {
    if (remaining <= 0) return
    const timer = setTimeout(() => setRemaining((seconds) => seconds - 1), 1000)
    return () => clearTimeout(timer)
  }, [remaining])

  const fail = useCallback((error: unknown, fallback?: string) => setFailure(describeFailure(error, fallback)), [])
  const clear = useCallback(() => setFailure(null), [])
  return { failure, remaining, fail, clear }
}

/**
 * One notice for a failed submit. Field-level validation shows under its fields instead, so it is skipped
 * here. A rate limit counts down on screen without re-announcing every second: the live region holds the
 * fixed sentence, the ticking number is decoration.
 */
export function FormFailureNotice({ failure, remaining }: { failure: FormFailure | null; remaining: number }) {
  if (!failure) return null
  if (failure.kind === 'validation' && Object.keys(failure.fields).length > 0) return null
  if (failure.kind === 'rate-limit' && failure.retryAfter) {
    return (
      <Notice tone="danger" title="Slow down">
        Too many attempts.{' '}
        <span className="kit-sr-only">Try again in {formatWait(failure.retryAfter)}.</span>
        <span aria-hidden="true" data-testid="retry-countdown">
          {remaining > 0 ? `Try again in ${formatWait(remaining)}.` : 'You can try again now.'}
        </span>
      </Notice>
    )
  }
  return <Notice tone="danger">{failure.message}</Notice>
}
