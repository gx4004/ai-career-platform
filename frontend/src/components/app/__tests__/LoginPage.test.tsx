import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
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
  it('renders the shared compact auth surface for the standalone fallback page', () => {
    const { container, queryByText } = render(<LoginPage />)

    expect(container.querySelector('[data-auth-surface]')).toBeTruthy()
    expect(container.querySelector('[data-brand-mode="compact"]')).toBeTruthy()
    expect(container.querySelector('.cw-brand-lockup')).toBeTruthy()
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
    expect(container.querySelector('.auth-page-signed-in')).toBeTruthy()
    sessionStatus.current = 'guest'
  })
})
