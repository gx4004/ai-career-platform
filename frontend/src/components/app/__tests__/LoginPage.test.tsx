import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LoginPage } from '#/pages/login-page'

const sessionStatus = vi.hoisted(() => ({ current: 'guest' as 'guest' | 'authenticated' }))

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
    register: vi.fn(async () => undefined),
    openAuthDialog: vi.fn(),
  }),
}))

describe('LoginPage', () => {
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

  it('puts a Google sign-in error under the tabs, above the form it concerns', () => {
    sessionStatus.current = 'guest'
    window.history.replaceState({}, '', '/login?oauth_error=auth_failed')
    try {
      render(<LoginPage />)
      const tabs = screen.getByRole('tablist')
      const notice = screen.getByRole('alert')
      expect(notice.textContent).toContain('Google sign-in failed')
      expect(tabs.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      const google = screen.getByRole('button', { name: 'Sign in with Google' })
      expect(notice.compareDocumentPosition(google) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    } finally {
      window.history.replaceState({}, '', '/')
    }
  })
})
