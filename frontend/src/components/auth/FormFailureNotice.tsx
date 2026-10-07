import { useCallback, useEffect, useRef, useState } from 'react'
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

  /** Records the failure and returns it, so the caller can move focus to the field it names. */
  const fail = useCallback((error: unknown, fallback?: string) => {
    const described = describeFailure(error, fallback)
    setFailure(described)
    return described
  }, [])
  const clear = useCallback(() => setFailure(null), [])
  return { failure, remaining, fail, clear }
}

/**
 * One notice for a failed submit. Field-level validation shows under its fields instead, so it is skipped
 * here, but only for the fields the form shows (`shownFields`): a refusal of any other field (a name the form
 * does not render, a token) is said here, never swallowed. A rate limit counts down on screen without
 * re-announcing every second: the live region holds the fixed sentence, the ticking number is decoration. The
 * rate-limit notice takes focus when it appears.
 */
export function FormFailureNotice({
  failure,
  remaining,
  shownFields,
}: {
  failure: FormFailure | null
  remaining: number
  /** API field names the form shows an error under. Omitted: every field failure is taken as shown. */
  shownFields?: readonly string[]
}) {
  const limitRef = useRef<HTMLDivElement>(null)
  // The forms disable the submit the user just pressed while a rate limit runs, which drops focus to the
  // page body. Hand focus to the notice instead, which keeps the keyboard user's place, and bring it into view
  // only as far as needed: it can land at the fold, and a notice already on screen must not move the page.
  useEffect(() => {
    const notice = limitRef.current
    if (!notice) return
    notice.focus({ preventScroll: true })
    notice.scrollIntoView?.({ block: 'nearest' })
  }, [failure])

  if (!failure) return null
  const failedFields = Object.keys(failure.fields).filter((field) => failure.fields[field])
  const allShown = shownFields ? failedFields.every((field) => shownFields.includes(field)) : true
  if (failure.kind === 'validation' && failedFields.length > 0 && allShown) return null
  if (failure.kind === 'rate-limit' && failure.retryAfter) {
    return (
      <Notice ref={limitRef} tabIndex={-1} tone="danger" title="Slow down">
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
