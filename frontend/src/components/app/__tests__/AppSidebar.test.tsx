import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppSidebar } from '#/components/app/AppSidebar'
import { TooltipProvider } from '#/components/kit'
import { SidebarProvider } from '#/components/ui/sidebar'

const mockPathname = vi.hoisted(() => ({ current: '/dashboard' }))
const mockStatus = vi.hoisted(() => ({ current: null as null | 'loading' }))
const mockSessionUser = vi.hoisted(() => ({
  current: { id: 'u1', email: 'test@example.com', full_name: 'Test User', is_admin: false } as {
    id: string
    email: string
    full_name: string
    is_admin: boolean
  } | null,
}))

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
  useRouterState: ({
    select,
  }: {
    select?: (state: { location: { pathname: string } }) => string
  } = {}) => {
    const state = {
      location: {
        pathname: mockPathname.current,
      },
    }

    return select ? select(state) : state
  },
}))

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({
    status: mockStatus.current ?? (mockSessionUser.current ? 'authenticated' : 'guest'),
    user: mockSessionUser.current,
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
  }),
}))

function renderSidebar(defaultOpen = false) {
  return render(
    <TooltipProvider delayDuration={0}>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar />
      </SidebarProvider>
    </TooltipProvider>,
  )
}

function getSidebarState(container: HTMLElement) {
  return container
    .querySelector<HTMLElement>('[data-slot="sidebar"][data-state]')
    ?.getAttribute('data-state')
}

function getSidebarTrigger(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[data-slot="sidebar-trigger"]')
}

describe('AppSidebar', () => {
  beforeEach(() => {
    mockPathname.current = '/dashboard'
    mockStatus.current = null
    mockSessionUser.current = { id: 'u1', email: 'test@example.com', full_name: 'Test User', is_admin: false }
  })

  it('shows discovery only to authenticated users', () => {
    const authenticated = renderSidebar()
    expect(screen.getByRole('link', { name: 'Discover' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Applications' })).toBeTruthy()
    authenticated.unmount()

    mockSessionUser.current = null
    renderSidebar()
    expect(screen.queryByRole('link', { name: 'Discover' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Applications' })).toBeNull()
  })

  it('lists the main destinations first, then Tools and History', () => {
    renderSidebar()

    expect(screen.getByText('Tools')).toBeTruthy()
    expect(screen.queryByText('Job search')).toBeNull()
    expect(screen.queryByText('You')).toBeNull()
    const order = [...document.querySelectorAll('a[data-sidebar="menu-button"]')].map((link) =>
      link.textContent?.trim(),
    )
    expect(order.slice(0, 5)).toEqual(['Dashboard', 'Discover', 'Applications', 'CV Studio', 'Profile'])
    expect(order.at(-1)).toBe('History')
    expect(screen.getByRole('link', { name: /resume analyzer/i }).getAttribute('href')).toBe('/resume')
    expect(screen.getByRole('link', { name: 'Discover' }).getAttribute('href')).toBe('/discovery')
    expect(screen.getByRole('link', { name: 'Applications' }).getAttribute('href')).toBe('/campaigns')
    expect(screen.queryByRole('link', { name: 'Queue' })).toBeNull()
    expect(screen.getByRole('link', { name: 'CV Studio' }).getAttribute('href')).toBe('/cv-studio')
    expect(screen.getByRole('link', { name: 'Profile' }).getAttribute('href')).toBe('/profile')
    expect(screen.getByRole('link', { name: 'History' }).getAttribute('href')).toBe('/history')
    // Account and Settings live in the session menu, not the sidebar.
    expect(screen.queryByRole('link', { name: 'Account' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull()
  })

  it('gives every destination its own icon (no shared compass)', () => {
    const { container } = renderSidebar(true)

    const links = [...container.querySelectorAll<HTMLAnchorElement>('a[data-sidebar="menu-button"]')]
    const iconFor = (link: HTMLAnchorElement) =>
      [...(link.querySelector('svg')?.classList ?? [])].find(
        (name) => name.startsWith('lucide-') && name !== 'lucide-icon',
      )
    const icons = links.map(iconFor)

    // Dashboard + Discover + Applications + CV Studio + Profile + 6 tools + History.
    expect(links).toHaveLength(12)
    expect(icons.every(Boolean)).toBe(true)
    expect(new Set(icons).size).toBe(links.length)
  })

  it('shows a visible text label for every destination when expanded', () => {
    const { container } = renderSidebar(true)

    for (const link of container.querySelectorAll('[data-sidebar="menu-button"]')) {
      // The tool tiles are decorative (aria-hidden) spans in front of the label.
      const label = link.querySelector('span:not([aria-hidden="true"])')
      expect(label?.textContent?.trim()).toBeTruthy()
    }
    expect(screen.getByText('Discover').tagName).toBe('SPAN')
  })

  it('names each icon in a tooltip when the sidebar is collapsed', async () => {
    renderSidebar(false)

    fireEvent.focus(screen.getByRole('link', { name: 'Discover' }))

    expect(await screen.findByRole('tooltip', { name: 'Discover' })).toBeTruthy()
  })

  it('keeps CV Studio, Profile and History visible for guests, unlike job search', () => {
    mockSessionUser.current = null
    renderSidebar()

    expect(screen.getByRole('link', { name: 'CV Studio' }).getAttribute('href')).toBe('/cv-studio')
    expect(screen.getByRole('link', { name: 'Profile' }).getAttribute('href')).toBe('/profile')
    expect(screen.getByRole('link', { name: 'History' }).getAttribute('href')).toBe('/history')
    expect(screen.queryByRole('link', { name: 'Discover' })).toBeNull()
  })

  it('starts collapsed on desktop when no cookie exists', () => {
    const { container } = renderSidebar()

    expect(getSidebarState(container)).toBe('collapsed')
    expect(
      container.querySelector('[data-brand-mode="compact"]'),
    ).toBeTruthy()
  })

  it('toggles between expanded and collapsed from the sidebar footer trigger', async () => {
    const { container } = renderSidebar(true)

    expect(getSidebarState(container)).toBe('expanded')

    const trigger = getSidebarTrigger(container)

    expect(trigger).toBeTruthy()

    fireEvent.click(trigger!)

    expect(getSidebarState(container)).toBe('collapsed')

    fireEvent.click(getSidebarTrigger(container)!)

    expect(getSidebarState(container)).toBe('expanded')
  })

  it('restores the saved desktop state from the sidebar cookie', async () => {
    document.cookie = 'sidebar_state=true; path=/'

    const { container } = renderSidebar()

    await waitFor(() => {
      expect(getSidebarState(container)).toBe('expanded')
    })

    expect(screen.getByText('Career Workbench')).toBeTruthy()
  })

  it('has no top bar: the account menu is in the sidebar footer and opens with Account, Settings and Sign out', async () => {
    const { container } = renderSidebar(true)

    expect(container.querySelector('.app-topbar')).toBeNull()
    const trigger = screen.getByRole('button', { name: 'Account menu for Test User' })
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    fireEvent.click(trigger)

    expect(await screen.findByRole('menuitem', { name: 'Account' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Admin' })).toBeNull()
  })

  it('offers a Sign in link in place of the account menu for guests', () => {
    mockSessionUser.current = null
    renderSidebar(true)

    expect(screen.queryByRole('button', { name: /Account menu/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login')
  })

  it('keeps every destination named when the sidebar is collapsed to its icon rail', () => {
    renderSidebar(false)

    for (const link of document.querySelectorAll('a[data-sidebar="menu-button"]')) {
      expect(link.textContent?.trim()).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeTruthy()
  })

  it('links the legal pages in the footer', () => {
    renderSidebar(true)

    const legal = screen.getByRole('navigation', { name: 'Legal' })
    expect(legal.querySelector('a[href="/privacy"]')).toBeTruthy()
    expect(legal.querySelector('a[href="/terms"]')).toBeTruthy()
    expect(legal.querySelector('a[href="/cookies"]')).toBeTruthy()
    expect(legal.querySelector('a[href="/imprint"]')).toBeTruthy()
  })

  it('draws a colour tile per tool and a bare icon per destination, under the Tools and Also labels', () => {
    const { container } = renderSidebar(true)

    const tiles = container.querySelectorAll('a[data-sidebar="menu-button"] .kit-tool-tile')
    expect([...tiles].map((tile) => tile.getAttribute('data-tone'))).toEqual([
      'tangerine',
      'mint',
      'lilac',
      'lemon',
      'rose',
      'aqua',
    ])
    expect(screen.getByText('Also')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Dashboard' }).querySelector('.kit-tool-tile')).toBeNull()
  })

  it('holds the owner-only rows and the account slot as placeholders while the session resolves', () => {
    mockStatus.current = 'loading'
    mockSessionUser.current = null
    const { container } = renderSidebar(true)

    expect(container.querySelectorAll('.app-sidebar__placeholder')).toHaveLength(2)
    expect(container.querySelector('.app-sidebar__account-placeholder')).toBeTruthy()
    // No guest "Sign in" flashes up for someone who is about to turn out to be signed in.
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
  })

  it('keeps the active tool highlighted and the normal sidebar controls on tool routes', () => {
    mockPathname.current = '/resume'

    const { container } = renderSidebar()

    const dashboardLink = screen.getByRole('link', { name: 'Dashboard' })
    const resumeLink = screen.getByRole('link', { name: /resume analyzer/i })

    expect(screen.queryByRole('link', { name: /back to dashboard/i })).toBeNull()
    expect(dashboardLink.getAttribute('data-active')).not.toBe('true')
    expect(resumeLink.getAttribute('data-active')).toBe('true')
    expect(getSidebarTrigger(container)).toBeTruthy()
  })
})
