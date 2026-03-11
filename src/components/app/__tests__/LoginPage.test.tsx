import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LoginPage } from '#/routes/login'

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
    openAuthDialog: vi.fn(),
  }),
}))

describe('LoginPage', () => {
  it('renders the shared full Career Workbench brand lockup instead of the old CW badge', () => {
    const { container, queryByText } = render(<LoginPage />)

    expect(container.querySelector('[data-brand-mode="full"]')).toBeTruthy()
    expect(container.querySelector('.cw-brand-lockup')).toBeTruthy()
    expect(queryByText(/^CW$/)).toBeNull()
  })
})
