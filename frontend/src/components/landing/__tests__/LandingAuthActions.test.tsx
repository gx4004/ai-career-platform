import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LandingFooter } from '#/components/landing/LandingFooter'
import { LandingNavbar } from '#/components/landing/LandingNavbar'

const mockOpenAuthDialog = vi.hoisted(() => vi.fn())

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

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({
    openAuthDialog: mockOpenAuthDialog,
  }),
}))

vi.mock('framer-motion', () => ({
  motion: {
    nav: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLElement>) => <nav {...props}>{children}</nav>,
  },
  useScroll: () => ({ scrollY: 0 }),
  useTransform: () => 1,
}))

describe('landing auth actions', () => {
  beforeEach(() => {
    mockOpenAuthDialog.mockReset()
  })

  it('opens auth dialog from the landing navbar sign-in button', () => {
    render(<LandingNavbar />)

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(mockOpenAuthDialog).toHaveBeenCalledWith({
      to: '/dashboard',
      reason: 'landing-signin',
      label: 'Sign in',
    })
  })

  it('keeps footer informational without auth actions', () => {
    render(<LandingFooter />)

    expect(screen.getByRole('img', { name: /career workbench/i })).toBeTruthy()
    expect(screen.getByText(/signal first\. better applications\. clearer next steps\./i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /sign in/i })).toBeNull()
  })
})
