import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LandingCTA } from '#/components/landing/LandingCTA'

class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
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
}))

vi.stubGlobal('IntersectionObserver', IntersectionObserverMock)

describe('LandingCTA', () => {
  it('renders one stable CTA to the dashboard', () => {
    const { container } = render(<LandingCTA />)

    expect(screen.getByRole('link', { name: /Upload your resume/i }).getAttribute('href')).toBe(
      '/dashboard',
    )
    expect(container.querySelector('#landing-cta')).toBeTruthy()
  })
})
