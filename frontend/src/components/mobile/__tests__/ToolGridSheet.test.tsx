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
  'VITE_R16_SUBMISSION_FOUNDATION_ENABLED',
  'VITE_R17_DEVELOPMENT_LOOP_ENABLED',
] as const

describe('ToolGridSheet authenticated workspace navigation', () => {
  beforeEach(() => {
    for (const flag of outcomeFlags) vi.stubEnv(flag, 'true')
  })

  it('exposes every enabled mobile-only workspace destination to an owner', () => {
    render(
      <ToolGridSheet
        open
        onOpenChange={vi.fn()}
        showAuthenticatedLinks
      />,
    )

    expect(screen.getByRole('link', { name: 'Evidence' }).getAttribute('href')).toBe('/profile')
    expect(screen.getByRole('link', { name: 'Discover' }).getAttribute('href')).toBe('/discovery')
    expect(screen.getByRole('link', { name: 'Queue' }).getAttribute('href')).toBe('/queue')
    expect(screen.getByRole('link', { name: 'Development' }).getAttribute('href')).toBe('/development-plan')
  })

  it('keeps owner destinations absent for guests even when flags are enabled', () => {
    render(<ToolGridSheet open onOpenChange={vi.fn()} showAuthenticatedLinks={false} />)

    expect(screen.queryByRole('link', { name: 'Evidence' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Discover' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Queue' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Development' })).toBeNull()
  })

  it('keeps every owner destination absent while the outcome chain is dark', () => {
    for (const flag of outcomeFlags) vi.stubEnv(flag, 'false')

    render(<ToolGridSheet open onOpenChange={vi.fn()} showAuthenticatedLinks />)

    expect(screen.queryByRole('link', { name: 'Evidence' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Discover' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Queue' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Development' })).toBeNull()
  })
})
