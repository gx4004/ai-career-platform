import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LandingHero } from '#/components/landing/LandingHero'

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

describe('LandingHero', () => {
  it('renders the headline and CTA', () => {
    const { getByText, getByRole } = render(<LandingHero />)

    expect(
      getByText('Build the search one strong decision at a time.'),
    ).toBeTruthy()

    const cta = getByRole('link', { name: /Start free — no login needed/i })
    expect(cta).toBeTruthy()
    expect(cta.getAttribute('href')).toBe('/dashboard')
  })
})
