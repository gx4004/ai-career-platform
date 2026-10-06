import { useSession } from '#/hooks/useSession'
import { hasSessionHint } from '#/lib/auth/sessionHint'

/**
 * Whether the signed-in person's own queries (Today, History, CVs) may run. Signed in: yes. While the
 * session is still being asked (/auth/me) in a browser that held a session recently, also yes: the page's
 * data then loads alongside /auth/me instead of after it. A stale hint costs one 401 per query, and the
 * page shows the guest view once the session answers 'guest'.
 */
export function useAccountQueriesEnabled(): boolean {
  const { status } = useSession()
  return status === 'authenticated' || (status === 'loading' && hasSessionHint())
}
