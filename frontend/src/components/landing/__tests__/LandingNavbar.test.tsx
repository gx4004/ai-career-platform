import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LandingNavbar } from '#/components/landing/LandingNavbar'

const openAuthDialogMock = vi.hoisted(() => vi.fn())

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
}))

vi.mock('#/components/ui/button', () => ({
  Button: ({
    children,
    asChild = false,
    onClick,
    ...props
  }: {
    children: ReactNode
    asChild?: boolean
    onClick?: () => void
  } & ButtonHTMLAttributes<HTMLButtonElement>) =>
    asChild ? (
      <>{children}</>
    ) : (
      <button type="button" onClick={onClick} {...props}>
        {children}
      </button>
    ),
}))

vi.mock('#/components/app/AppBrandLockup', () => ({
  AppBrandLockup: () => <div data-testid="brand-lockup" />,
}))

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({
    openAuthDialog: openAuthDialogMock,
  }),
}))

describe('LandingNavbar', () => {
  it('renders the original base landing navbar actions without section anchors', () => {
    render(<LandingNavbar />)

    const sectionLinks = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('#'))

    expect(sectionLinks).toHaveLength(0)
    expect(screen.getByRole('link', { name: 'Get started' }).getAttribute('href')).toBe(
      '/dashboard',
    )
    expect(screen.getByTestId('brand-lockup')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(openAuthDialogMock).toHaveBeenCalledWith({
      to: '/dashboard',
      reason: 'landing-signin',
      label: 'Sign in',
    })
  })
})
