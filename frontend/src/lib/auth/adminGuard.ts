import { isRedirect, redirect } from '@tanstack/react-router'
import { getCurrentUser } from '#/lib/api/client'

export async function requireAdmin() {
  try {
    // Always fetch fresh — never trust the cache for authorization.
    // A recently-demoted admin must be blocked immediately, not after staleTime expires.
    const user = await getCurrentUser()
    if (!user?.is_admin) {
      throw redirect({ to: '/dashboard' })
    }
  } catch (e) {
    if (isRedirect(e)) throw e
    // Auth failure (401, network error, etc.) → send to login
    throw redirect({ to: '/login' })
  }
}
