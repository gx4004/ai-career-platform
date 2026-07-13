import { isRedirect, redirect } from '@tanstack/react-router'
import { getCurrentUser } from '#/lib/api/client'

export async function requireUser() {
  try {
    await getCurrentUser()
  } catch (error) {
    if (isRedirect(error)) throw error
    throw redirect({ to: '/login' })
  }
}
