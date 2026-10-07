import { Fragment } from 'react'

/**
 * An email that may wrap at the "@" (and, as text always may, after a hyphen) instead of anywhere: a narrow
 * column breaks "history-profile-r2-31@example.com" before the "@", not into a one-letter orphan.
 */
export function breakableEmail(email: string) {
  const at = email.indexOf('@')
  if (at <= 0) return email
  return (
    <Fragment>
      {email.slice(0, at)}
      <wbr />
      {email.slice(at)}
    </Fragment>
  )
}
