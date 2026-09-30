import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ToolGridSheet } from '#/components/mobile/ToolGridSheet'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children: ReactNode
    to: string
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>{children}</a>
  ),
}))

describe('ToolGridSheet authenticated workspace navigation', () => {
  it('exposes every mobile-only workspace destination to an owner, grouped like the sidebar', () => {
    render(
      <ToolGridSheet
        open
        onOpenChange={vi.fn()}
        showAuthenticatedLinks
      />,
    )

    expect(screen.getByRole('link', { name: 'Profile' }).getAttribute('href')).toBe('/profile')
    expect(screen.getByRole('link', { name: 'CV Studio' }).getAttribute('href')).toBe('/cv-studio')
    expect(screen.getByRole('link', { name: 'Discover' }).getAttribute('href')).toBe('/discovery')
    expect(screen.getByRole('link', { name: 'Applications' }).getAttribute('href')).toBe('/campaigns')
    expect(screen.getByRole('heading', { name: 'Job search' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'You' })).toBeTruthy()
  })

  it('keeps job-search destinations absent for guests, but keeps You visible', () => {
    render(<ToolGridSheet open onOpenChange={vi.fn()} showAuthenticatedLinks={false} />)

    expect(screen.queryByRole('link', { name: 'Discover' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Applications' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Profile' }).getAttribute('href')).toBe('/profile')
    expect(screen.getByRole('link', { name: 'CV Studio' }).getAttribute('href')).toBe('/cv-studio')
  })

})
