import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isRedirect } from '@tanstack/react-router'
import { ApiError } from '#/lib/api/errors'
import { queryClient } from '#/lib/query/queryClient'
import { readPendingIntent, clearPendingIntent } from '#/lib/auth/pendingIntent'

const getCurrentUser = vi.hoisted(() => vi.fn())
vi.mock('#/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/api/client')>()),
  getCurrentUser,
}))

const { requireUser } = await import('#/lib/auth/userGuard')
const { requireAdmin } = await import('#/lib/auth/adminGuard')

const where = (href: string) => ({ location: { href, pathname: href.split(/[?#]/)[0] } }) as never

async function redirected(run: () => Promise<unknown>) {
  try {
    await run()
  } catch (error) {
    expect(isRedirect(error)).toBe(true)
    return (error as { options: { to: string } }).options
  }
  return null
}

beforeEach(() => {
  window.localStorage.clear()
  clearPendingIntent()
  queryClient.clear()
  getCurrentUser.mockReset()
})

describe('requireUser', () => {
  it('lets a signed-in user through', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1', is_admin: false })
    expect(await redirected(() => requireUser(where('/discovery')))).toBeNull()
  })

  it('sends a guest to sign-in and remembers the page they wanted (auth-account-D04)', async () => {
    getCurrentUser.mockRejectedValue(new ApiError('Not authenticated', 401))

    const target = await redirected(() => requireUser(where('/campaigns?tab=saved')))

    expect(target?.to).toBe('/login')
    expect(readPendingIntent()?.to).toBe('/campaigns?tab=saved')
  })

  it('does not ask the server again for a guest the session already resolved', async () => {
    queryClient.setQueryData(['current-user'], null)

    const target = await redirected(() => requireUser(where('/discovery')))

    expect(target?.to).toBe('/login')
    expect(getCurrentUser).not.toHaveBeenCalled()
    expect(readPendingIntent()?.to).toBe('/discovery')
  })

  it('lets the page render during an outage instead of pretending the person is signed out', async () => {
    getCurrentUser.mockRejectedValue(new ApiError("Can't reach the server.", 0))

    expect(await redirected(() => requireUser(where('/discovery')))).toBeNull()
    expect(readPendingIntent()).toBeNull()
  })

  it('never remembers an unsafe destination', async () => {
    getCurrentUser.mockRejectedValue(new ApiError('Not authenticated', 401))

    await redirected(() => requireUser(where('//evil.example/x')))

    expect(readPendingIntent()).toBeNull()
  })

  it('reuses the session query instead of asking /auth/me again (integration-sweep-D11)', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1', is_admin: false })
    queryClient.setQueryData(['current-user'], { id: 'u1', is_admin: false })

    await requireUser(where('/discovery'))

    expect(getCurrentUser).not.toHaveBeenCalled()
  })

  it('shares one request with the session boot when both ask at once', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1', is_admin: false })
    const boot = queryClient.fetchQuery({ queryKey: ['current-user'], queryFn: getCurrentUser, staleTime: 0 })

    await requireUser(where('/discovery'))
    await boot

    expect(getCurrentUser).toHaveBeenCalledTimes(1)
  })
})

describe('requireAdmin', () => {
  it('sends a guest to sign-in and remembers /admin', async () => {
    getCurrentUser.mockRejectedValue(new ApiError('Not authenticated', 401))

    const target = await redirected(() => requireAdmin(where('/admin/users')))

    expect(target?.to).toBe('/login')
    expect(readPendingIntent()?.to).toBe('/admin/users')
  })

  it('sends a signed-in non-admin to the dashboard without a return trip', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1', is_admin: false })

    const target = await redirected(() => requireAdmin(where('/admin')))

    expect(target?.to).toBe('/dashboard')
    expect(readPendingIntent()).toBeNull()
  })

  it('always asks the server fresh, so a demoted admin is stopped at once', async () => {
    queryClient.setQueryData(['current-user'], { id: 'u1', is_admin: true })
    getCurrentUser.mockResolvedValue({ id: 'u1', is_admin: false })

    const target = await redirected(() => requireAdmin(where('/admin')))

    expect(target?.to).toBe('/dashboard')
    expect(getCurrentUser).toHaveBeenCalledTimes(1)
  })
})
