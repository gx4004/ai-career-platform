import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MobileNav } from '#/components/app/MobileNav'

const pathname = vi.hoisted(() => ({ current: '/dashboard' }))
const openAuthDialog = vi.hoisted(() => vi.fn())
const sessionUser = vi.hoisted(() => ({ current: { id: 'user-1' } as { id: string } | null }))
const sessionStatus = vi.hoisted(() => ({ current: null as string | null }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>{children}</a>
  ),
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: pathname.current } }),
}))

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({
    status: sessionStatus.current ?? (sessionUser.current ? 'authenticated' : 'guest'),
    user: sessionUser.current,
    openAuthDialog,
  }),
}))
vi.mock('#/components/mobile/ToolGridSheet', () => ({ ToolGridSheet: () => null }))

describe('MobileNav discovery visibility', () => {
  beforeEach(() => {
    pathname.current = '/dashboard'
    sessionUser.current = { id: 'user-1' }
    sessionStatus.current = null
  })

  it.each(['loading', 'unreachable'])('holds the two account tabs as placeholders while the session is %s', (status) => {
    sessionUser.current = null
    sessionStatus.current = status
    render(<MobileNav />)
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    // Five slots, so nothing shifts when the session answers; no guest Sign in tab flashes up first.
    expect(nav.querySelectorAll('.app-tabbar__item')).toHaveLength(5)
    expect(nav.querySelectorAll('.app-tabbar__placeholder')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'History' })).toBeNull()
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
    expect(nav.querySelectorAll('.app-tabbar__item')).toHaveLength(5)

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(openAuthDialog).toHaveBeenCalledWith({ to: '/discovery', reason: 'discovery' })
  })

  it('gives signed-in users Home, Discover, Applications, CV and More', () => {
    render(<MobileNav />)
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    const labels = [...nav.querySelectorAll('.app-tabbar__item')].map((tab) => tab.textContent)
    expect(labels).toEqual(['Home', 'Discover', 'Applications', 'CV', 'More'])
    expect(screen.getByRole('link', { name: 'Applications' }).getAttribute('href')).toBe('/campaigns')
    expect(screen.getByRole('link', { name: 'CV' }).getAttribute('href')).toBe('/cv-studio')
  })
})

describe('MobileNav current page', () => {
  beforeEach(() => {
    pathname.current = '/dashboard'
    sessionUser.current = { id: 'user-1' }
  })

  it('marks the current tab with aria-current and leaves the others unmarked', () => {
    pathname.current = '/campaigns/abc'
    render(<MobileNav />)

    expect(screen.getByRole('link', { name: 'Applications' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBeNull()
  })

  it('lights More while a tool or profile page is open', () => {
    pathname.current = '/resume'
    render(<MobileNav />)

    expect(screen.getByRole('button', { name: 'More' }).getAttribute('data-active')).toBe('true')
  })

  it('opens and closes the More sheet from the More tab', () => {
    render(<MobileNav />)
    const more = screen.getByRole('button', { name: 'More' })

    expect(more.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(more)
    expect(more.getAttribute('aria-expanded')).toBe('true')
  })
})
