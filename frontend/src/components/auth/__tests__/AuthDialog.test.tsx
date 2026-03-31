import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthDialog } from '#/components/auth/AuthDialog'
import { useSession } from '#/hooks/useSession'
import { SessionProvider } from '#/lib/auth/session'

const loginMock = vi.hoisted(() => vi.fn())
const getAuthProvidersMock = vi.hoisted(() => vi.fn())
const getCurrentUserMock = vi.hoisted(() => vi.fn())
const getHealthMock = vi.hoisted(() => vi.fn())
const navigateToPathMock = vi.hoisted(() => vi.fn())
const registerMock = vi.hoisted(() => vi.fn())
const storageState = vi.hoisted(() => ({
  local: {} as Record<string, string>,
  session: {} as Record<string, string>,
}))

vi.mock('#/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}))

vi.mock('#/lib/api/client', () => ({
  getAuthProviders: getAuthProvidersMock,
  getCurrentUser: getCurrentUserMock,
  getHealth: getHealthMock,
  login: loginMock,
  register: registerMock,
}))

vi.mock('#/lib/navigation/redirect', () => ({
  navigateToPath: navigateToPathMock,
}))

vi.mock('#/lib/auth/storage', () => ({
  canUseDOM: () => true,
  getAuthToken: () => storageState.local.auth_token ?? null,
  setAuthToken: (token: string) => {
    storageState.local.auth_token = token
  },
  clearAuthToken: () => {
    delete storageState.local.auth_token
  },
  readStorageJson: <T,>(key: string) =>
    storageState.local[key] ? (JSON.parse(storageState.local[key]) as T) : null,
  writeStorageJson: <T,>(key: string, value: T) => {
    storageState.local[key] = JSON.stringify(value)
  },
  removeStorageValue: (key: string) => {
    delete storageState.local[key]
  },
  readSessionJson: <T,>(key: string) =>
    storageState.session[key] ? (JSON.parse(storageState.session[key]) as T) : null,
  writeSessionJson: <T,>(key: string, value: T) => {
    storageState.session[key] = JSON.stringify(value)
  },
  removeSessionValue: (key: string) => {
    delete storageState.session[key]
  },
}))

function LandingSignInButton() {
  const { openAuthDialog } = useSession()

  return (
    <button
      type="button"
      onClick={() =>
        openAuthDialog({
          to: '/dashboard',
          reason: 'landing-signin',
          label: 'Sign in',
        })
      }
    >
      Launch sign in
    </button>
  )
}

function renderAuthFlow() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <LandingSignInButton />
        <AuthDialog />
      </SessionProvider>
    </QueryClientProvider>,
  )
}

describe('AuthDialog', () => {
  beforeEach(() => {
    storageState.local = {}
    storageState.session = {}
    loginMock.mockReset()
    getAuthProvidersMock.mockReset()
    getCurrentUserMock.mockReset()
    getHealthMock.mockReset()
    navigateToPathMock.mockReset()
    registerMock.mockReset()
    getAuthProvidersMock.mockResolvedValue({ providers: [] })
    getCurrentUserMock.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      full_name: 'Test User',
      is_active: true,
    })
    getHealthMock.mockResolvedValue({ status: 'ok' })
    registerMock.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      full_name: 'Test User',
      is_active: true,
    })
  })

  it('navigates to /login instead of opening a dialog when openAuthDialog is called', async () => {
    renderAuthFlow()

    fireEvent.click(screen.getByRole('button', { name: /launch sign in/i }))

    await waitFor(() => {
      expect(navigateToPathMock).toHaveBeenCalledWith('/login')
    })

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
