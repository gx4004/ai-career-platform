import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminLayout } from '#/pages/admin/admin-layout'

const route = vi.hoisted(() => ({ pathname: '/admin/users', breakpoint: 'desktop' as 'desktop' | 'tablet' | 'mobile' }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  Outlet: () => <main id="main-content">page</main>,
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: route.pathname } }),
}))
vi.mock('#/hooks/use-breakpoint', () => ({ useBreakpoint: () => route.breakpoint }))

const DESTINATIONS = ['Dashboard', 'Discovery sources', 'Users', 'Runs']

describe('AdminLayout', () => {
  beforeEach(() => {
    route.pathname = '/admin/users'
    route.breakpoint = 'desktop'
  })

  it('uses the app sidebar: brand row, collapse control, the admin destinations and a way back', () => {
    render(<AdminLayout />)
    const nav = within(screen.getByRole('navigation', { name: 'Admin navigation' }))
    expect(nav.getAllByRole('link').map((link) => link.textContent)).toEqual(DESTINATIONS)
    expect(screen.getByRole('link', { name: 'Career Workbench, back to the app' }).getAttribute('href')).toBe('/dashboard')
    expect(screen.getByRole('button', { name: /sidebar/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to app' }).getAttribute('href')).toBe('/dashboard')
    expect(document.querySelector('.app-sidebar')).toBeTruthy()
  })

  it('marks only the current destination', () => {
    render(<AdminLayout />)
    const nav = within(screen.getByRole('navigation', { name: 'Admin navigation' }))
    expect(nav.getByRole('link', { name: 'Users' }).getAttribute('aria-current')).toBe('page')
    expect(nav.getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBeNull()
  })

  it('treats the index route as the dashboard', () => {
    route.pathname = '/admin'
    render(<AdminLayout />)
    const nav = within(screen.getByRole('navigation', { name: 'Admin navigation' }))
    expect(nav.getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBe('page')
    expect(nav.getByRole('link', { name: 'Users' }).getAttribute('aria-current')).toBeNull()
  })

  it('renders the page inside the layout with a skip link to it', () => {
    render(<AdminLayout />)
    expect(screen.getByRole('main')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Skip to main content' }).getAttribute('href')).toBe('#main-content')
  })

  it('on a phone puts every destination in a sheet instead of a clipped strip', () => {
    route.breakpoint = 'mobile'
    render(<AdminLayout />)
    expect(document.querySelector('.app-sidebar')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Users' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Admin navigation' }))
    const sheet = within(screen.getByRole('dialog', { name: 'Admin' }))
    for (const name of DESTINATIONS) expect(sheet.getByRole('link', { name })).toBeTruthy()
    expect(sheet.getByRole('link', { name: 'Users' }).getAttribute('aria-current')).toBe('page')
    expect(sheet.getByRole('link', { name: 'Back to app' })).toBeTruthy()
  })
})
