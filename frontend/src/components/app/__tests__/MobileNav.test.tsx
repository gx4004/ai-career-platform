import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MobileNav } from '#/components/app/MobileNav'

const pathname = vi.hoisted(() => ({ current: '/dashboard' }))
const sessionUser = vi.hoisted(() => ({ current: { id: 'user-1' } as { id: string } | null }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>{children}</a>
  ),
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: pathname.current } }),
}))

vi.mock('#/hooks/use-breakpoint', () => ({ useBreakpoint: () => 'mobile' }))
vi.mock('#/hooks/useSession', () => ({ useSession: () => ({ user: sessionUser.current }) }))
vi.mock('#/components/mobile/ToolGridSheet', () => ({ ToolGridSheet: () => null }))

describe('MobileNav discovery visibility', () => {
  beforeEach(() => {
    for (const flag of [
      'VITE_R11_EVIDENCE_PROFILE_ENABLED',
      'VITE_R12_CV_STUDIO_ENABLED',
      'VITE_R13_CAMPAIGNS_ENABLED',
      'VITE_R14_DISCOVERY_ENABLED',
    ]) vi.stubEnv(flag, 'true')
    pathname.current = '/dashboard'
    sessionUser.current = { id: 'user-1' }
  })

  it('gives authenticated mobile users a discovery route', () => {
    render(<MobileNav />)
    expect(screen.getByRole('link', { name: 'Discover' }).getAttribute('href')).toBe('/discovery')
  })

  it('keeps discovery absent for guests', () => {
    sessionUser.current = null
    render(<MobileNav />)
    expect(screen.queryByRole('link', { name: 'Discover' })).toBeNull()
  })
})
