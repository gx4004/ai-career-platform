import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Topbar } from '#/components/app/Topbar'

const mockPathname = vi.hoisted(() => ({ current: '/dashboard' }))
const session = vi.hoisted(() => ({
  current: {
    status: 'authenticated',
    user: { id: 'u1', email: 'a@example.com', full_name: 'Ada Lovelace', is_admin: false },
    logout: vi.fn(),
  } as { status: string; user: Record<string, unknown> | null; logout: () => void },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useRouterState: ({ select }: { select?: (state: { location: { pathname: string } }) => string } = {}) => {
    const state = { location: { pathname: mockPathname.current } }
    return select ? select(state) : state
  },
}))

vi.mock('#/hooks/useSession', () => ({ useSession: () => session.current }))

describe('Topbar (phones)', () => {
  beforeEach(() => {
    mockPathname.current = '/dashboard'
    session.current = {
      status: 'authenticated',
      user: { id: 'u1', email: 'a@example.com', full_name: 'Ada Lovelace', is_admin: false },
      logout: vi.fn(),
    }
  })

  it('shows the brand and the account menu, and nothing else', () => {
    const { container } = render(<Topbar />)

    expect(container.querySelector('header.app-topbar')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Career Workbench home' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Account menu for Ada Lovelace' })).toBeTruthy()
    expect(container.querySelector('h1, h2')).toBeNull()
  })

  it('sends the brand to the landing page from the dashboard and to the dashboard elsewhere', () => {
    const { unmount } = render(<Topbar />)
    expect(screen.getByRole('link', { name: 'Career Workbench home' }).getAttribute('href')).toBe('/')
    unmount()

    mockPathname.current = '/history'
    render(<Topbar />)
    expect(screen.getByRole('link', { name: 'Career Workbench home' }).getAttribute('href')).toBe('/dashboard')
  })

  it('opens the account menu with Account, Settings and Sign out, and signs out', async () => {
    render(<Topbar />)

    const trigger = screen.getByRole('button', { name: 'Account menu for Ada Lovelace' })
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    fireEvent.click(trigger)

    expect(await screen.findByRole('menuitem', { name: 'Account' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Admin' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(session.current.logout).toHaveBeenCalledTimes(1)
  })

  it('gives admins an Admin entry', async () => {
    session.current.user = { id: 'u1', email: 'a@example.com', full_name: 'Ada Lovelace', is_admin: true }
    render(<Topbar />)

    const trigger = screen.getByRole('button', { name: 'Account menu for Ada Lovelace' })
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    fireEvent.click(trigger)

    expect((await screen.findByRole('menuitem', { name: 'Admin' })).getAttribute('href')).toBe('/admin')
  })

  it('leaves signing in to the tab bar for guests, who still get Search', () => {
    session.current = { status: 'guest', user: null, logout: vi.fn() }
    render(<Topbar />)

    expect(screen.queryByRole('button', { name: /Account menu/ })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy()
  })

  it('opens the command palette from the Search button (phones have no ⌘K)', () => {
    const opened = vi.fn()
    window.addEventListener('cw:open-command-palette', opened)
    render(<Topbar />)

    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(opened).toHaveBeenCalledTimes(1)
    window.removeEventListener('cw:open-command-palette', opened)
  })
})
