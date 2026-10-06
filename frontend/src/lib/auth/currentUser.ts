import { getCurrentUser, getSessionState, refreshSession } from '#/lib/api/client'
import { ApiError } from '#/lib/api/errors'
import type { User } from '#/lib/api/schemas'
import { hasSessionHint, markSessionHint } from '#/lib/auth/sessionHint'

/** The one query every part of the app reads the signed-in user from (session, route guards, service banner). */
export const CURRENT_USER_QUERY_KEY = ['current-user'] as const

/**
 * The signed-in user, or null for a guest. A browser that never held a session asks GET /auth/refresh/session (a
 * guest is a 200 null, so a guest's page load has no failed request; when that read says a refresh cookie came
 * with it, one silent refresh and /auth/me restore the session); one that did asks /auth/me, whose 401
 * is worth one silent refresh. A dropped connection or a 5xx throws, so an outage is never mistaken for
 * being signed out. A user the server names marks this browser as
 * holding a session (also after a Google sign-in or a sign-up made outside the forms), so a later 401 is
 * worth one silent refresh.
 */
export async function fetchSessionUser(): Promise<User | null> {
  if (!hasSessionHint()) {
    // No hint: ask the read that answers a guest with a 200 null instead of a failed 401.
    const { user, refreshable } = await getSessionState()
    if (user) {
      markSessionHint()
      return user
    }
    // The hint is gone (cleared storage, a lapsed hint) but the refresh cookie is not: one refresh restores
    // the session. A refresh that fails leaves a guest; there is no session here to sign out of.
    if (refreshable !== true || !(await refreshSession())) return null
    try {
      const restored = await getCurrentUser()
      markSessionHint()
      return restored
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null
      throw error
    }
  }
  try {
    const user = await getCurrentUser()
    markSessionHint()
    return user
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      if (!hasSessionHint()) return null
      // The client drops the hint when the refresh token is refused; a hint that survived a 401 means the
      // refresh itself could not be completed (down, rate-limited). That is an outage the service banner
      // names and re-checks, not a sign-out.
      throw new ApiError('The service is temporarily unavailable. Try again in a moment.', 503, undefined, {
        cause: error,
      })
    }
    throw error
  }
}
