import { isRedirect, redirect } from '@tanstack/react-router'
import { getCurrentUser } from '#/lib/api/client'
import { queryClient } from '#/lib/query/queryClient'

export async function requireAdmin() {
  try {
    const user = await queryClient.ensureQueryData({
      queryKey: ['current-user'],
      queryFn: getCurrentUser,
    })
    if (!user?.is_admin) {
      throw redirect({ to: '/dashboard' })
    }
  } catch (e) {
    if (isRedirect(e)) throw e
    // Auth failure (401, network error, etc.) → send to login
    throw redirect({ to: '/login' })
  }
}
