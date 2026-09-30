import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MobileNav } from '#/components/app/MobileNav'

const pathname = vi.hoisted(() => ({ current: '/dashboard' }))
const openAuthDialog = vi.hoisted(() => vi.fn())
const sessionUser = vi.hoisted(() => ({ current: { id: 'user-1' } as { id: string } | null }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>{children}</a>
  ),
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: pathname.current } }),
}))

vi.mock('#/hooks/use-breakpoint', () => ({ useBreakpoint: () => 'mobile' }))
vi.mock('#/hooks/useSession', () => ({ useSession: () => ({ user: sessionUser.current, openAuthDialog }) }))
vi.mock('#/components/mobile/ToolGridSheet', () => ({ ToolGridSheet: () => null }))

describe('MobileNav discovery visibility', () => {
  beforeEach(() => {
    pathname.current = '/dashboard'
    sessionUser.current = { id: 'user-1' }
  })

  it('gives authenticated mobile users a discovery route', () => {
    render(<MobileNav />)
    expect(screen.getByRole('link', { name: 'Discover' }).getAttribute('href')).toBe('/discovery')
  })

  it('keeps five tabs for guests, swapping Discover for a Sign in tab', () => {
    sessionUser.current = null
    render(<MobileNav />)
    expect(screen.queryByRole('link', { name: 'Discover' })).toBeNull()
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(nav.querySelectorAll('.mobile-tab-item')).toHaveLength(5)

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(openAuthDialog).toHaveBeenCalledWith({ to: '/discovery', reason: 'discovery' })
  })

  it('gives signed-in users Home, Discover, Applications, CV and More', () => {
    render(<MobileNav />)
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    const labels = [...nav.querySelectorAll('.mobile-tab-item')].map((tab) => tab.textContent)
    expect(labels).toEqual(['Home', 'Discover', 'Applications', 'CV', 'More'])
    expect(screen.getByRole('link', { name: 'Applications' }).getAttribute('href')).toBe('/campaigns')
    expect(screen.getByRole('link', { name: 'CV' }).getAttribute('href')).toBe('/cv-studio')
  })
})
