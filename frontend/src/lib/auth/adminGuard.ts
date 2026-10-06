import { redirect } from '@tanstack/react-router'
import type { ParsedLocation } from '@tanstack/react-router'
import { CURRENT_USER_QUERY_KEY, fetchSessionUser } from '#/lib/auth/currentUser'
import { redirectToSignIn } from '#/lib/auth/userGuard'
import { queryClient } from '#/lib/query/queryClient'

/**
 * Admins only. Always asks the server fresh (never the cache) so a demoted admin is stopped at once; the
 * answer refreshes the shared session query. A guest signs in and comes back; a signed-in non-admin goes to
 * the dashboard. During an outage the layout renders and the admin API, which checks the role itself,
 * refuses the data.
 */
export async function requireAdmin({ location }: { location: Pick<ParsedLocation, 'href'> }) {
  let user
  try {
    user = await queryClient.fetchQuery({ queryKey: CURRENT_USER_QUERY_KEY, queryFn: fetchSessionUser, staleTime: 0 })
  } catch {
    return
  }
  if (!user) throw redirectToSignIn(location)
  if (!user.is_admin) throw redirect({ to: '/dashboard' })
}
