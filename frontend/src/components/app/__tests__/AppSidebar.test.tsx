import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppSidebar } from '#/components/app/AppSidebar'
import { Topbar } from '#/components/app/Topbar'
import { TooltipProvider } from '#/components/ui/tooltip'
import { SidebarProvider } from '#/components/ui/sidebar'

const mockUseIsMobile = vi.hoisted(() => vi.fn())
const mockPathname = vi.hoisted(() => ({ current: '/dashboard' }))
const mockSessionUser = vi.hoisted(() => ({ current: { id: 'u1', email: 'test@example.com', name: 'Test User' } as { id: string; email: string; name: string } | null }))

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

vi.mock('#/hooks/use-mobile', () => ({
  useIsMobile: mockUseIsMobile,
}))

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({
    status: 'authenticated',
    user: mockSessionUser.current,
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
  }),
}))

vi.mock('#/components/auth/SessionMenu', () => ({
  SessionMenu: () => <div>Session menu</div>,
}))

vi.mock('#/lib/navigation/routeMeta', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/lib/navigation/routeMeta')>()
  return {
    ...actual,
    getRouteMeta: () => ({
      sectionLabel: 'Workspace',
      title: 'Dashboard',
      description: 'Current workbench view.',
      breadcrumbs: ['Home', 'Dashboard'],
    }),
  }
})

function renderSidebar(defaultOpen = false) {
  return render(
    <TooltipProvider delayDuration={0}>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar />
      </SidebarProvider>
    </TooltipProvider>,
  )
}

function renderShellForMobile() {
  return render(
    <TooltipProvider delayDuration={0}>
      <SidebarProvider defaultOpen={false}>
        <AppSidebar />
        <Topbar />
      </SidebarProvider>
    </TooltipProvider>,
  )
}

function renderShell() {
  return render(
    <TooltipProvider delayDuration={0}>
      <SidebarProvider defaultOpen={false}>
        <AppSidebar />
        <Topbar />
      </SidebarProvider>
    </TooltipProvider>,
  )
}

function getSidebarState(container: HTMLElement) {
  return container
    .querySelector<HTMLElement>('[data-slot="sidebar"][data-state]')
    ?.getAttribute('data-state')
}

function getBrandRowTrigger(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[data-slot="sidebar-trigger"]')
}

describe('AppSidebar', () => {
  beforeEach(() => {
    mockPathname.current = '/dashboard'
    mockUseIsMobile.mockReturnValue(false)
    mockSessionUser.current = { id: 'u1', email: 'test@example.com', name: 'Test User' }
  })

  it('shows discovery only to authenticated users', () => {
    const authenticated = renderSidebar()
    expect(screen.getByRole('link', { name: 'Discover' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Queue' })).toBeTruthy()
    authenticated.unmount()

    mockSessionUser.current = null
    renderSidebar()
    expect(screen.queryByRole('link', { name: 'Discover' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Queue' })).toBeNull()
  })

  it('groups the sidebar into Tools, Job search, and You', () => {
    renderSidebar()

    expect(screen.getByText('Tools')).toBeTruthy()
    expect(screen.getByText('Job search')).toBeTruthy()
    expect(screen.getByText('You')).toBeTruthy()
    expect(screen.getByRole('link', { name: /resume analyzer/i }).getAttribute('href')).toBe('/resume')
    expect(screen.getByRole('link', { name: 'Discover' }).getAttribute('href')).toBe('/discovery')
    expect(screen.getByRole('link', { name: 'Queue' }).getAttribute('href')).toBe('/queue')
    expect(screen.getByRole('link', { name: 'Campaigns' }).getAttribute('href')).toBe('/campaigns')
    expect(screen.getByRole('link', { name: 'CV Studio' }).getAttribute('href')).toBe('/cv-studio')
    expect(screen.getByRole('link', { name: 'Profile' }).getAttribute('href')).toBe('/profile')
    expect(screen.getByRole('link', { name: 'History' }).getAttribute('href')).toBe('/history')
  })

  it('gives every destination its own icon (no shared compass)', () => {
    const { container } = renderSidebar(true)

    const links = [...container.querySelectorAll<HTMLAnchorElement>('[data-sidebar="menu-button"]')]
    const iconFor = (link: HTMLAnchorElement) =>
      [...(link.querySelector('svg')?.classList ?? [])].find(
        (name) => name.startsWith('lucide-') && name !== 'lucide-icon',
      )
    const icons = links.map(iconFor)

    // Dashboard + 6 tools + Job search (3) + You (3) + Account + Settings.
    expect(links).toHaveLength(15)
    expect(icons.every(Boolean)).toBe(true)
    expect(new Set(icons).size).toBe(links.length)
  })

  it('shows a visible text label for every destination when expanded', () => {
    const { container } = renderSidebar(true)

    for (const link of container.querySelectorAll('[data-sidebar="menu-button"]')) {
      const label = link.querySelector('span')
      expect(label?.textContent?.trim()).toBeTruthy()
    }
    expect(screen.getByText('Discover').tagName).toBe('SPAN')
  })

  it('names each icon in a tooltip when the sidebar is collapsed', async () => {
    renderSidebar(false)

    fireEvent.focus(screen.getByRole('link', { name: 'Discover' }))

    expect(await screen.findByRole('tooltip', { name: 'Discover' })).toBeTruthy()
  })

  it('keeps "You" destinations visible for guests, unlike "Job search"', () => {
    mockSessionUser.current = null
    renderSidebar()

    expect(screen.getByRole('link', { name: 'CV Studio' }).getAttribute('href')).toBe('/cv-studio')
    expect(screen.getByRole('link', { name: 'Profile' }).getAttribute('href')).toBe('/profile')
    expect(screen.getByRole('link', { name: 'History' }).getAttribute('href')).toBe('/history')
    expect(screen.queryByText('Job search')).toBeNull()
  })

  it('starts collapsed on desktop when no cookie exists', () => {
    const { container } = renderSidebar()

    expect(getSidebarState(container)).toBe('collapsed')
    expect(
      container.querySelector('[data-brand-mode="compact"]'),
    ).toBeTruthy()
  })

  it('toggles between expanded and collapsed from the sidebar brand row trigger', async () => {
    const { container } = renderSidebar(true)

    expect(getSidebarState(container)).toBe('expanded')

    const trigger = getBrandRowTrigger(container)

    expect(trigger).toBeTruthy()

    fireEvent.click(trigger!)

    expect(getSidebarState(container)).toBe('collapsed')

    fireEvent.click(getBrandRowTrigger(container)!)

    expect(getSidebarState(container)).toBe('expanded')
  })

  it('restores the saved desktop state from the sidebar cookie', async () => {
    document.cookie = 'sidebar_state=true; path=/'

    const { container } = renderSidebar()

    await waitFor(() => {
      expect(getSidebarState(container)).toBe('expanded')
    })

    expect(
      container.querySelector('[data-brand-mode="full"]'),
    ).toBeTruthy()
  })

  it('keeps the session menu only in the topbar', () => {
    renderShell()

    expect(screen.getByText('Session menu')).toBeTruthy()
    expect(screen.getAllByText('Session menu')).toHaveLength(1)
  })

  it('keeps a mobile topbar trigger that opens the off-canvas sidebar', async () => {
    mockUseIsMobile.mockReturnValue(true)

    renderShellForMobile()

    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(
      screen.getByRole('button', {
        name: /toggle sidebar/i,
      }),
    )

    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('keeps the active tool highlighted and shows a dashboard back arrow on tool routes', () => {
    mockPathname.current = '/resume'

    const { container } = renderSidebar()

    const backLink = screen.getByRole('link', { name: /back to dashboard/i })
    const dashboardLink = screen.getByRole('link', { name: 'Dashboard' })
    const resumeLink = screen.getByRole('link', { name: /resume analyzer/i })

    expect(backLink.getAttribute('href')).toBe('/dashboard')
    expect(dashboardLink.getAttribute('data-active')).not.toBe('true')
    expect(resumeLink.getAttribute('data-active')).toBe('true')
    expect(getBrandRowTrigger(container)).toBeNull()
    expect(container.querySelector('[data-slot="sidebar-rail"]')).toBeNull()
  })
})
