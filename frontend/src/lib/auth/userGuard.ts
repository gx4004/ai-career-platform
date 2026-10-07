import { redirect } from '@tanstack/react-router'
import type { ParsedLocation } from '@tanstack/react-router'
import { CURRENT_USER_QUERY_KEY, fetchSessionUser } from '#/lib/auth/currentUser'
import { writePendingIntent } from '#/lib/auth/pendingIntent'
import { safeInternalPath } from '#/lib/navigation/redirect'
import { queryClient } from '#/lib/query/queryClient'

/** `preload` is true when the router runs the guard for a hover or touch preload, not a visit. */
export type GuardContext = { location: Pick<ParsedLocation, 'href'>; preload?: boolean }

/**
 * Sign-in first, then straight back to the page that asked for it. A preload only peeks: it still redirects
 * (the router then preloads /login, without navigating) but remembers nothing, so hovering a link never
 * replaces the page a real visit asked to come back to.
 */
export function redirectToSignIn(location: GuardContext['location'], preload = false) {
  const to = preload ? null : safeInternalPath(location.href)
  if (to) writePendingIntent({ to, reason: 'protected-route', createdAt: Date.now() })
  return redirect({ to: '/login' })
}

/**
 * Only signed-in people get in. Reads the session's own query (one /auth/me shared with the shell, not a
 * second one); a guest is sent to sign in and comes back here afterwards. An outage is not a sign-out: the
 * page renders and its own requests show the problem.
 */
export async function requireUser({ location, preload }: GuardContext) {
  let user
  try {
    user = await queryClient.fetchQuery({ queryKey: CURRENT_USER_QUERY_KEY, queryFn: fetchSessionUser })
  } catch {
    return
  }
  if (!user) throw redirectToSignIn(location, preload)
}

/**
 * Waits for the session check (the shell's one /auth/me) before a signed-in-only page renders, so the page knows at
 * once whether it shows the person's data or its in-page sign-in gate, with no signed-in skeleton flashing for a
 * guest and no account requests sent without a session. Never redirects (consistency-F25: every signed-in-only page
 * gates a guest in place); an outage renders the page, whose own requests show the problem.
 */
export async function resolveSession() {
  try {
    await queryClient.fetchQuery({ queryKey: CURRENT_USER_QUERY_KEY, queryFn: fetchSessionUser })
  } catch {
    // The page renders and says what went wrong.
  }
}
