import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppSidebar } from '#/components/app/AppSidebar'
import { Topbar } from '#/components/app/Topbar'
import { TooltipProvider } from '#/components/ui/tooltip'
import { SidebarProvider } from '#/components/ui/sidebar'

const mockUseIsMobile = vi.hoisted(() => vi.fn())
const mockPathname = vi.hoisted(() => ({ current: '/dashboard' }))

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

vi.mock('#/components/auth/SessionMenu', () => ({
  SessionMenu: () => <div>Session menu</div>,
}))

vi.mock('#/lib/navigation/routeMeta', () => ({
  getRouteMeta: () => ({
    sectionLabel: 'Workspace',
    title: 'Dashboard',
    description: 'Current workbench view.',
    breadcrumbs: ['Home', 'Dashboard'],
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
