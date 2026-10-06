import { redirect } from '@tanstack/react-router'
import type { ParsedLocation } from '@tanstack/react-router'
import { CURRENT_USER_QUERY_KEY, fetchSessionUser } from '#/lib/auth/currentUser'
import { writePendingIntent } from '#/lib/auth/pendingIntent'
import { safeInternalPath } from '#/lib/navigation/redirect'
import { queryClient } from '#/lib/query/queryClient'

type GuardContext = { location: Pick<ParsedLocation, 'href'> }

/** Sign-in first, then straight back to the page that asked for it. */
export function redirectToSignIn(location: GuardContext['location']) {
  const to = safeInternalPath(location.href)
  if (to) writePendingIntent({ to, reason: 'protected-route', createdAt: Date.now() })
  return redirect({ to: '/login' })
}

/**
 * Only signed-in people get in. Reads the session's own query (one /auth/me shared with the shell, not a
 * second one); a guest is sent to sign in and comes back here afterwards. An outage is not a sign-out: the
 * page renders and its own requests show the problem.
 */
export async function requireUser({ location }: GuardContext) {
  let user
  try {
    user = await queryClient.fetchQuery({ queryKey: CURRENT_USER_QUERY_KEY, queryFn: fetchSessionUser })
  } catch {
    return
  }
  if (!user) throw redirectToSignIn(location)
}
