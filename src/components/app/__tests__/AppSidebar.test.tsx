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

vi.mock('#/components/app/ThemeToggle', () => ({
  ThemeToggle: () => <div>Theme toggle</div>,
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

  it('keeps the theme toggle only in the topbar', () => {
    renderShell()

    expect(screen.getByText('Theme toggle')).toBeTruthy()
    expect(screen.getAllByText('Theme toggle')).toHaveLength(1)
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
})
