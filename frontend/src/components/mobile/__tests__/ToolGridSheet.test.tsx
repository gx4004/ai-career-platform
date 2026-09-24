import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

const outcomeFlags = [
  'VITE_R11_EVIDENCE_PROFILE_ENABLED',
  'VITE_R12_CV_STUDIO_ENABLED',
  'VITE_R13_CAMPAIGNS_ENABLED',
  'VITE_R14_DISCOVERY_ENABLED',
  'VITE_R15_QUEUE_ENABLED',
  'VITE_R17_DEVELOPMENT_LOOP_ENABLED',
] as const

describe('ToolGridSheet authenticated workspace navigation', () => {
  beforeEach(() => {
    for (const flag of outcomeFlags) vi.stubEnv(flag, 'true')
  })

  it('exposes every enabled mobile-only workspace destination to an owner, grouped like the sidebar', () => {
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
    expect(screen.getByRole('link', { name: 'Queue' }).getAttribute('href')).toBe('/queue')
    expect(screen.getByRole('link', { name: 'Campaigns' }).getAttribute('href')).toBe('/campaigns')
    expect(screen.getByRole('heading', { name: 'Job search' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'You' })).toBeTruthy()
  })

  it('keeps job-search destinations absent for guests even when flags are enabled, but keeps You visible', () => {
    render(<ToolGridSheet open onOpenChange={vi.fn()} showAuthenticatedLinks={false} />)

    expect(screen.queryByRole('link', { name: 'Discover' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Queue' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Campaigns' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Profile' }).getAttribute('href')).toBe('/profile')
    expect(screen.getByRole('link', { name: 'CV Studio' }).getAttribute('href')).toBe('/cv-studio')
  })

  it('keeps every flag-gated destination absent while the outcome chain is dark', () => {
    for (const flag of outcomeFlags) vi.stubEnv(flag, 'false')

    render(<ToolGridSheet open onOpenChange={vi.fn()} showAuthenticatedLinks />)

    expect(screen.queryByRole('link', { name: 'Profile' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'CV Studio' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Discover' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Queue' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Campaigns' })).toBeNull()
  })
})
