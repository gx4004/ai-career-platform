import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { fireEvent, render as baseRender, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from '#/pages/login-page'

const sessionStatus = vi.hoisted(() => ({ current: 'guest' as 'guest' | 'authenticated' }))
const registerMock = vi.hoisted(() => vi.fn(async () => undefined))
const logoutMock = vi.hoisted(() => vi.fn(async () => undefined))
const getAuthProvidersMock = vi.hoisted(() => vi.fn())
const pendingIntent = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }))

vi.mock('#/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/api/client')>()),
  getAuthProviders: getAuthProvidersMock,
  requestPasswordReset: vi.fn(),
}))
vi.mock('#/lib/auth/pendingIntent', () => ({ readPendingIntent: () => pendingIntent.current }))

let client = new QueryClient()
function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
function render(ui: ReactNode) {
  return baseRender(ui, { wrapper: Wrapper })
}

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children: ReactNode
    to: string
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  createFileRoute: () => (options: unknown) => options,
  useRouter: () => ({
    history: { back: vi.fn() },
    navigate: vi.fn(),
  }),
}))

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({
    status: sessionStatus.current,
    providers: [],
    authError: '',
    login: vi.fn(async () => undefined),
    register: registerMock,
    logout: logoutMock,
    googleLogin: vi.fn(),
    openAuthDialog: vi.fn(),
  }),
}))

describe('LoginPage', () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    getAuthProvidersMock.mockReset().mockResolvedValue({ providers: ['google'] })
    pendingIntent.current = null
    sessionStatus.current = 'guest'
  })

  it('renders the shared auth surface under the brand, with a link home', () => {
    const { container, queryByText } = render(<LoginPage />)

    expect(container.querySelector('[data-auth-surface]')).toBeTruthy()
    expect(container.querySelector('.cw-brand-lockup')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Career Workbench home' }).getAttribute('href')).toBe('/')
    expect(screen.getByRole('main')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in to your workspace' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Continue as guest' }).getAttribute('href')).toBe('/dashboard')
    expect(container.querySelector('.auth-visual')).toBeNull()
    expect(queryByText(/^CW$/)).toBeNull()
    expect(queryByText(/coming soon/i)).toBeNull()
  })

  it('uses sentence-case tab labels and the trimmed intro, with no redundant guest note', () => {
    sessionStatus.current = 'guest'
    const { container } = render(<LoginPage />)

    expect(screen.getByRole('tab', { name: 'Sign in' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Create account' })).toBeTruthy()
    expect(screen.getByText('Keep your runs and favorites across every tool.')).toBeTruthy()
    expect(screen.queryByText(/No account needed to browse/)).toBeNull()
    expect(container.querySelector('.auth-surface-note')).toBeNull()
  })

  it('shows a plain signed-in panel without an Authenticated badge', () => {
    sessionStatus.current = 'authenticated'
    const { container } = render(<LoginPage />)

    expect(screen.getByRole('heading', { name: "You're already signed in" })).toBeTruthy()
    expect(screen.getByText('Head back to your dashboard to keep going.')).toBeTruthy()
    expect(screen.queryByText('Authenticated')).toBeNull()
    expect(screen.getByRole('link', { name: 'Go to dashboard' }).getAttribute('href')).toBe('/dashboard')
    // The same brand header and column as every other auth screen.
    expect(container.querySelector('.cw-brand-lockup')).toBeTruthy()
    expect(container.querySelector('.auth-page__column')).toBeTruthy()
    expect(screen.getByRole('main')).toBeTruthy()
    sessionStatus.current = 'guest'
  })

  it('heads the reset step with its own title and drops the tabs while it is open', () => {
    sessionStatus.current = 'guest'
    render(<LoginPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Reset your password' })).toBeTruthy()
    expect(screen.getAllByRole('heading', { name: 'Reset your password' })).toHaveLength(1)
    expect(screen.queryByRole('tab', { name: 'Sign in' })).toBeNull()
    expect(screen.queryByText('Keep your runs and favorites across every tool.')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in to your workspace' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Sign in' })).toBeTruthy()
  })

  it('puts a Google sign-in error under the tabs, above the form it concerns', async () => {
    sessionStatus.current = 'guest'
    window.history.replaceState({}, '', '/login?oauth_error=auth_failed')
    try {
      render(<LoginPage />)
      const tabs = screen.getByRole('tablist')
      const notice = screen.getByRole('alert')
      expect(notice.textContent).toContain('Google sign-in failed')
      expect(tabs.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      const google = await screen.findByRole('button', { name: 'Sign in with Google' })
      expect(notice.compareDocumentPosition(google) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    } finally {
      window.history.replaceState({}, '', '/')
    }
  })

  it('offers no Google button when the deployment has no Google', async () => {
    getAuthProvidersMock.mockResolvedValue({ providers: [] })
    render(<LoginPage />)
    await waitFor(() => expect(getAuthProvidersMock).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /Google/ })).toBeNull()
  })

  it('does not offer to sign up with Google: a first account is made with email', async () => {
    render(<LoginPage />)
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Create account' }))
    await waitFor(() => expect(getAuthProvidersMock).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /Google/ })).toBeNull()
  })

  it('says where sign-in will take a visitor whose session ended', async () => {
    pendingIntent.current = { to: '/resume/result/abc', reason: 'session-expired', createdAt: Date.now() }
    render(<LoginPage />)
    expect((await screen.findByTestId('auth-intent')).textContent).toContain('Your session ended')
  })

  it('names the tool a guest result will return to', async () => {
    pendingIntent.current = { to: '/resume', reason: 'guest-demo-result', toolId: 'resume', createdAt: Date.now() }
    render(<LoginPage />)
    expect((await screen.findByTestId('auth-intent')).textContent).toContain('Resume Analyzer')
  })

  it('stamps a seal on the signed-in page right after an account is created, and not on a plain visit', async () => {
    const { container, rerender } = render(<LoginPage />)
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Create account' }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'sufficiently-long-pass' } })
    fireEvent.click(screen.getByRole('checkbox'))
    sessionStatus.current = 'authenticated'
    fireEvent.click(screen.getByRole('button', { name: 'Create free account' }))
    await waitFor(() => expect(registerMock).toHaveBeenCalled())
    rerender(<LoginPage />)
    expect(await screen.findByRole('heading', { name: "You're already signed in" })).toBeTruthy()
    expect(container.querySelector('.auth-stamp .kit-seal')).toBeTruthy()
    expect(screen.getByText(/Your account is ready/)).toBeTruthy()
  })

  it('lets a signed-in visitor sign out from the already-signed-in page', () => {
    sessionStatus.current = 'authenticated'
    render(<LoginPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(logoutMock).toHaveBeenCalled()
  })
})
