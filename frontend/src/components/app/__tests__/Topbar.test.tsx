import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Topbar } from '#/components/app/Topbar'
import { SidebarProvider } from '#/components/ui/sidebar'
import { getRouteMeta } from '#/lib/navigation/routeMeta'

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

function renderTopbar() {
  return render(
    <SidebarProvider defaultOpen={false}>
      <Topbar />
    </SidebarProvider>,
  )
}

describe('Topbar', () => {
  beforeEach(() => {
    mockUseIsMobile.mockReturnValue(false)
    mockPathname.current = '/dashboard'
  })

  it('keeps Command center as the dashboard route label in metadata', () => {
    expect(getRouteMeta('/dashboard').sectionLabel).toBe('Command center')
    expect(getRouteMeta('/dashboard').topbarVariant).toBe('compact')
  })

  it('uses the compact variant on the dashboard without the boxed hero chrome or CTA', () => {
    const { container } = renderTopbar()

    expect(container.querySelector('.topbar')).toBeTruthy()
    expect(container.querySelector('.topbar--compact')).toBeTruthy()
    expect(container.querySelector('.topbar-inner--compact')).toBeTruthy()
    expect(container.querySelector('.topbar-meta')).toBeNull()
    expect(screen.queryByText('Command center')).toBeNull()
    expect(screen.queryByText('Review your current pipeline, recent runs, and the recommended next step.')).toBeNull()
    expect(screen.queryByText('Start with resume')).toBeNull()
    expect(screen.getByText('Your Workspace')).toBeTruthy()
  })

  it('uses the compact breadcrumb-only variant on tool pages', () => {
    mockPathname.current = '/career'

    const { container } = renderTopbar()

    expect(getRouteMeta('/career').topbarVariant).toBe('compact')
    expect(container.querySelector('.topbar--compact')).toBeTruthy()
    expect(container.querySelector('.topbar-inner--compact')).toBeTruthy()
    expect(container.querySelector('.topbar-meta')).toBeNull()
    expect(screen.queryByText('Planning')).toBeNull()
    expect(screen.queryByText('Compare target directions, timelines, and the skill gaps to close.')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Dashboard' })).toBeNull()
    expect(container.querySelector('[data-slot="breadcrumb-separator"]')).toBeNull()
    expect(container.querySelector('.topbar-tool-entry-chip')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Career Path' })).toBeNull()
    expect(screen.getByText('Career Path')).toBeTruthy()
  })

  it('uses the compact breadcrumb-only variant on tool result pages', () => {
    mockPathname.current = '/portfolio/result/demo-run'

    renderTopbar()

    expect(getRouteMeta('/portfolio/result/demo-run').topbarVariant).toBe('compact')
    expect(screen.getByRole('link', { name: 'Dashboard' }).getAttribute('href')).toBe('/dashboard')
    expect(screen.queryByRole('link', { name: 'Portfolio Planner' })).toBeNull()
    expect(screen.getByText('Portfolio Planner')).toBeTruthy()
    expect(screen.getByText('Result')).toBeTruthy()
    expect(screen.queryByText('Saved output for portfolio planner.')).toBeNull()
  })

  it('renders compact breadcrumb on secondary pages like history', () => {
    mockPathname.current = '/history'

    const { container } = renderTopbar()

    expect(container.querySelector('.topbar')).toBeTruthy()
    expect(container.querySelector('.topbar--compact')).toBeTruthy()
    expect(screen.getByText('History')).toBeTruthy()
  })
})
