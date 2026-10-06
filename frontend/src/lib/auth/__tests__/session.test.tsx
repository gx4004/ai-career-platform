import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '#/lib/api/errors'
import { useSession } from '#/hooks/useSession'
import { SessionProvider } from '#/lib/auth/session'
import { fetchSessionUser } from '#/lib/auth/currentUser'
import { readPendingIntent, writePendingIntent } from '#/lib/auth/pendingIntent'
import { clearSessionHint, hasSessionHint, markSessionHint } from '#/lib/auth/sessionHint'

const api = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getAuthProviders: vi.fn(),
  getHealth: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
  getSessionState: vi.fn(),
}))
// GET /auth/session (a browser without a session hint) answers what /auth/me would, a guest as a 200 null.
async function sessionRead() {
  try {
    return { user: await api.getCurrentUser() }
  } catch (error) {
    if ((error as { status?: number }).status === 401) return { user: null }
    throw error
  }
}
const navigateToPath = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/client', () => ({ API_URL: '/api/v1', ...api }))
vi.mock('#/lib/navigation/redirect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/navigation/redirect')>()),
  navigateToPath,
}))
vi.mock('#/lib/privacy/browserData', () => ({ clearSensitiveBrowserData: vi.fn() }))

const ADA = { id: 'u1', email: 'ada@example.com', full_name: 'Ada', is_active: true, is_admin: false }

function Probe() {
  const session = useSession()
  const [draft, setDraft] = useState('')
  const [loginResult, setLoginResult] = useState('')
  return (
    <div>
      <span data-testid="status">{session.status}</span>
      <span data-testid="draft">{draft}</span>
      <span data-testid="login-result">{loginResult}</span>
      <button onClick={() => setDraft('typed before the session settled')}>Type</button>
      <button onClick={() => void session.login({ email: 'ada@example.com', password: 'long-enough-password' })}>Log in</button>
      <button
        onClick={() =>
          session.login({ email: 'ada@example.com', password: 'long-enough-password' }).then(
            () => setLoginResult('resolved'),
            () => setLoginResult('rejected'),
          )
        }
      >
        Log in and report
      </button>
      <button onClick={() => void session.logout()}>Log out</button>
      <button onClick={() => session.openAuthDialog({ to: '/resume', reason: 'save-demo-result', view: 'register' })}>
        Create account
      </button>
    </div>
  )
}

function renderSession() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <Probe />
      </SessionProvider>
    </QueryClientProvider>,
  )
  return client
}

const status = () => screen.getByTestId('status').textContent

beforeEach(() => {
  window.localStorage.clear()
  for (const mock of Object.values(api)) mock.mockReset()
  navigateToPath.mockReset()
  api.getAuthProviders.mockResolvedValue({ providers: [] })
  api.getHealth.mockResolvedValue({ status: 'ok' })
  api.login.mockResolvedValue(undefined)
  api.logout.mockResolvedValue({ ok: true })
  api.getSessionState.mockImplementation(sessionRead)
})
afterEach(() => {
  window.history.replaceState({}, '', '/')
})

describe('SessionProvider boot (FE-3, integration-sweep-D10)', () => {
  it('asks only who is signed in: no providers list and no health check on every page', async () => {
    api.getCurrentUser.mockResolvedValue(ADA)
    renderSession()

    await waitFor(() => expect(status()).toBe('authenticated'))
    expect(api.getCurrentUser).toHaveBeenCalledTimes(1)
    expect(api.getAuthProviders).not.toHaveBeenCalled()
    expect(api.getHealth).not.toHaveBeenCalled()
  })

  it('reads a 401 as a guest', async () => {
    api.getCurrentUser.mockRejectedValue(new ApiError('Not authenticated', 401))
    renderSession()

    await waitFor(() => expect(status()).toBe('guest'))
  })

  it('does not show a signed-in browser as a guest while the server is unreachable', async () => {
    markSessionHint()
    api.getCurrentUser.mockRejectedValue(new ApiError("Can't reach the server.", 0))
    renderSession()

    await waitFor(() => expect(status()).toBe('unreachable'))
  })

  it('also reads a 5xx on the session check as unreachable for a signed-in browser', async () => {
    markSessionHint()
    api.getCurrentUser.mockRejectedValue(new ApiError('Something went wrong on our side.', 503))
    renderSession()

    await waitFor(() => expect(status()).toBe('unreachable'))
  })

  it('a browser that never signed in stays a guest during an outage', async () => {
    api.getCurrentUser.mockRejectedValue(new ApiError("Can't reach the server.", 0))
    renderSession()

    await waitFor(() => expect(status()).toBe('guest'))
  })

  it('remembers that this browser holds a session once the server names the user (Google sign-in, API sign-up)', async () => {
    api.getCurrentUser.mockResolvedValue(ADA)
    renderSession()

    await waitFor(() => expect(status()).toBe('authenticated'))
    expect(hasSessionHint()).toBe(true)
  })

  it('keeps the page mounted while the signed-in user resolves: nothing typed meanwhile is lost', async () => {
    let resolveUser: (user: typeof ADA) => void = () => {}
    api.getCurrentUser.mockReturnValue(new Promise((resolve) => (resolveUser = resolve)))
    renderSession()

    expect(status()).toBe('loading')
    fireEvent.click(screen.getByRole('button', { name: 'Type' }))
    await act(async () => resolveUser(ADA))

    await waitFor(() => expect(status()).toBe('authenticated'))
    expect(screen.getByTestId('draft').textContent).toBe('typed before the session settled')
  })
})

describe('signing in and out', () => {
  it('a guest who signs in keeps the page (no remount) and the browser is marked as signed in', async () => {
    api.getCurrentUser.mockRejectedValueOnce(new ApiError('Not authenticated', 401)).mockResolvedValue(ADA)
    renderSession()
    await waitFor(() => expect(status()).toBe('guest'))
    fireEvent.click(screen.getByRole('button', { name: 'Type' }))

    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))

    await waitFor(() => expect(status()).toBe('authenticated'))
    expect(hasSessionHint()).toBe(true)
    expect(screen.getByTestId('draft').textContent).toBe('typed before the session settled')
  })

  it('signing out clears the hint and resets what the previous owner had on screen', async () => {
    api.getCurrentUser.mockResolvedValue(ADA)
    renderSession()
    await waitFor(() => expect(status()).toBe('authenticated'))
    fireEvent.click(screen.getByRole('button', { name: 'Type' }))

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))

    await waitFor(() => expect(status()).toBe('guest'))
    expect(hasSessionHint()).toBe(false)
    expect(screen.getByTestId('draft').textContent).toBe('')
  })

  it('follows a pending intent after sign-in only when it is an in-app path', async () => {
    api.getCurrentUser.mockRejectedValueOnce(new ApiError('Not authenticated', 401)).mockResolvedValue(ADA)
    writePendingIntent({ to: '//evil.example/phish', reason: 'session-expired', createdAt: Date.now() })
    renderSession()
    await waitFor(() => expect(status()).toBe('guest'))

    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))

    await waitFor(() => expect(status()).toBe('authenticated'))
    expect(navigateToPath).not.toHaveBeenCalled()
    expect(readPendingIntent()).toBeNull()
  })

  it('returns to a saved result after signing in elsewhere in the app', async () => {
    api.getCurrentUser.mockRejectedValueOnce(new ApiError('Not authenticated', 401)).mockResolvedValue(ADA)
    writePendingIntent({ to: '/cover-letter/result/run-1', reason: 'open-result', createdAt: Date.now() })
    renderSession()
    await waitFor(() => expect(status()).toBe('guest'))

    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))

    await waitFor(() => expect(navigateToPath).toHaveBeenCalledWith('/cover-letter/result/run-1'))
  })

  it('leaves the next step to the sign-in page when signing in there', async () => {
    window.history.replaceState({}, '', '/login')
    api.getCurrentUser.mockRejectedValueOnce(new ApiError('Not authenticated', 401)).mockResolvedValue(ADA)
    writePendingIntent({ to: '/discovery', reason: 'protected-route', createdAt: Date.now() })
    renderSession()
    await waitFor(() => expect(status()).toBe('guest'))

    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))

    await waitFor(() => expect(status()).toBe('authenticated'))
    expect(navigateToPath).not.toHaveBeenCalled()
  })

  it('a credential exchange that worked is not a failure when the follow-up identity check cannot answer', async () => {
    api.getCurrentUser
      .mockRejectedValueOnce(new ApiError('Not authenticated', 401))
      .mockRejectedValue(new ApiError('Something went wrong on our side.', 500))
    renderSession()
    await waitFor(() => expect(status()).toBe('guest'))

    fireEvent.click(screen.getByRole('button', { name: 'Log in and report' }))

    await waitFor(() => expect(screen.getByTestId('login-result').textContent).toBe('resolved'))
    expect(status()).toBe('unreachable')
    expect(hasSessionHint()).toBe(true)
  })

  it('a session ended in another tab (hint gone) signs this tab out and drops what the owner had on screen', async () => {
    api.getCurrentUser.mockResolvedValue(ADA)
    renderSession()
    await waitFor(() => expect(status()).toBe('authenticated'))
    fireEvent.click(screen.getByRole('button', { name: 'Type' }))

    // What the client now does on a 401 without a hint (signed out in the other tab).
    clearSessionHint()
    act(() => {
      window.dispatchEvent(new CustomEvent('cw:session-expired'))
    })

    await waitFor(() => expect(status()).toBe('guest'))
    expect(screen.getByTestId('draft').textContent).toBe('')
  })

  it('opens sign-in on the Create account tab when asked to', async () => {
    api.getCurrentUser.mockRejectedValue(new ApiError('Not authenticated', 401))
    renderSession()

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(navigateToPath).toHaveBeenCalledWith('/login?view=register')
    expect(readPendingIntent()?.to).toBe('/resume')
  })
})

describe('fetchSessionUser', () => {
  it('a 401 that survived with the hint (the refresh could not be completed) is an outage, not a guest', async () => {
    markSessionHint()
    api.getCurrentUser.mockRejectedValue(new ApiError('Not authenticated', 401))

    await expect(fetchSessionUser()).rejects.toMatchObject({ status: 503 })
  })

  it('a 401 without the hint is a guest', async () => {
    api.getCurrentUser.mockRejectedValue(new ApiError('Not authenticated', 401))

    await expect(fetchSessionUser()).resolves.toBeNull()
  })

  it('a browser that never held a session asks the read that answers a guest without a 401 (B13)', async () => {
    api.getSessionState.mockReset().mockResolvedValue({ user: null })

    await expect(fetchSessionUser()).resolves.toBeNull()
    expect(api.getSessionState).toHaveBeenCalledTimes(1)
    expect(api.getCurrentUser).not.toHaveBeenCalled()
  })

  it('a session the anonymous-safe read names marks this browser as holding one (B13)', async () => {
    api.getSessionState.mockReset().mockResolvedValue({ user: ADA })

    await expect(fetchSessionUser()).resolves.toEqual(ADA)
    expect(hasSessionHint()).toBe(true)
  })
})
