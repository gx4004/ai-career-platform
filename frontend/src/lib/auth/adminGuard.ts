import { redirect } from '@tanstack/react-router'
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
    // Re-throw redirects as-is
    if (e && typeof e === 'object' && 'to' in e) throw e
    // Auth failure → send to login
    throw redirect({ to: '/login' })
  }
}
