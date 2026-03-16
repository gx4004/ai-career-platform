import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LoginPage } from '#/pages/login-page'

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
}))

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({
    status: 'guest',
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
    expect(container.querySelector('[data-brand-mode="full"]')).toBeTruthy()
    expect(container.querySelector('.cw-brand-lockup')).toBeTruthy()
    expect(container.querySelector('.auth-visual')).toBeNull()
    expect(queryByText(/^CW$/)).toBeNull()
    expect(queryByText(/coming soon/i)).toBeNull()
  })
})
