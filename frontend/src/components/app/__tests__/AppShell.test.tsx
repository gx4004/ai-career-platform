import type { ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from '#/components/app/AppShell'

const mockPathname = vi.hoisted(() => ({ current: '/' }))
const mockBreakpoint = vi.hoisted(() => ({ current: 'desktop' as string | null }))

vi.mock('@tanstack/react-router', () => ({
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

vi.mock('#/hooks/use-breakpoint', () => ({ useKnownBreakpoint: () => mockBreakpoint.current }))

vi.mock('#/components/app/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('#/components/app/AppSidebar', () => ({
  AppSidebar: () => <div data-testid="app-sidebar" />,
}))

vi.mock('#/components/app/MobileNav', () => ({
  MobileNav: () => <div data-testid="mobile-nav" />,
}))

vi.mock('#/components/app/ServiceBanner', () => ({
  ServiceBanner: () => <div data-testid="service-banner" />,
}))

vi.mock('#/components/app/Topbar', () => ({
  Topbar: () => <div data-testid="topbar" />,
}))

vi.mock('#/components/app/CommandPalette', () => ({
  CommandPalette: () => <div data-testid="command-palette" />,
}))

vi.mock('#/components/app/AuthDialogMount', () => ({
  AuthDialogMount: () => <div data-testid="auth-dialog" />,
}))

vi.mock('#/components/ui/sidebar', () => ({
  SidebarProvider: ({
    children,
    defaultOpen,
    railRoute,
  }: {
    children: ReactNode
    defaultOpen?: boolean
    railRoute?: boolean
  }) => (
    <div
      data-testid="sidebar-provider"
      data-default-open={String(Boolean(defaultOpen))}
      data-rail-route={String(Boolean(railRoute))}
    >
      {children}
    </div>
  ),
  SidebarInset: ({ children }: { children: ReactNode }) => (
    <div data-testid="sidebar-inset">{children}</div>
  ),
}))

describe('AppShell', () => {
  beforeEach(() => {
    mockPathname.current = '/'
    mockBreakpoint.current = 'desktop'
  })

  it('renders the stable landing route without the workspace shell', () => {
    render(
      <AppShell>
        <div data-testid="page-child" />
      </AppShell>,
    )

    expect(screen.getByTestId('page-child')).toBeTruthy()
    expect(screen.getByTestId('auth-dialog')).toBeTruthy()
    expect(screen.queryByTestId('sidebar-provider')).toBeNull()
    expect(screen.queryByTestId('app-sidebar')).toBeNull()
    expect(screen.queryByTestId('topbar')).toBeNull()
    expect(screen.queryByTestId('mobile-nav')).toBeNull()
    expect(screen.queryByTestId('command-palette')).toBeNull()
  })

  it('renders the landing experiment route without the workspace shell', () => {
    mockPathname.current = '/landing-experiment'

    render(
      <AppShell>
        <div data-testid="page-child" />
      </AppShell>,
    )

    expect(screen.getByTestId('page-child')).toBeTruthy()
    expect(screen.getByTestId('auth-dialog')).toBeTruthy()
    expect(screen.queryByTestId('sidebar-provider')).toBeNull()
    expect(screen.queryByTestId('app-sidebar')).toBeNull()
    expect(screen.queryByTestId('topbar')).toBeNull()
    expect(screen.queryByTestId('mobile-nav')).toBeNull()
    expect(screen.queryByTestId('command-palette')).toBeNull()
  })

  it('renders the standalone landing tools route without the workspace shell', () => {
    mockPathname.current = '/landing-tools'

    render(
      <AppShell>
        <div data-testid="page-child" />
      </AppShell>,
    )

    expect(screen.getByTestId('page-child')).toBeTruthy()
    expect(screen.getByTestId('auth-dialog')).toBeTruthy()
    expect(screen.queryByTestId('sidebar-provider')).toBeNull()
    expect(screen.queryByTestId('app-sidebar')).toBeNull()
    expect(screen.queryByTestId('topbar')).toBeNull()
    expect(screen.queryByTestId('mobile-nav')).toBeNull()
    expect(screen.queryByTestId('command-palette')).toBeNull()
  })

  it('renders the hidden /_kit gallery without the workspace shell', () => {
    mockPathname.current = '/_kit'

    render(
      <AppShell>
        <div data-testid="page-child" />
      </AppShell>,
    )

    expect(screen.getByTestId('page-child')).toBeTruthy()
    expect(screen.queryByTestId('sidebar-provider')).toBeNull()
    expect(screen.queryByTestId('app-sidebar')).toBeNull()
    expect(screen.queryByTestId('mobile-nav')).toBeNull()
    expect(screen.queryByTestId('command-palette')).toBeNull()
  })

  it('keeps dashboard routes inside the workspace shell', () => {
    mockPathname.current = '/dashboard'

    render(
      <AppShell>
        <div data-testid="page-child" />
      </AppShell>,
    )

    expect(screen.getByTestId('sidebar-provider').getAttribute('data-default-open')).toBe('true')
    expect(screen.getByTestId('app-sidebar')).toBeTruthy()
    expect(screen.getByTestId('sidebar-inset')).toBeTruthy()
    // Desktop has no topbar: page headers start the page; ⌘K palette is mounted.
    expect(screen.queryByTestId('topbar')).toBeNull()
    expect(screen.getByTestId('command-palette')).toBeTruthy()
    // The tab bar is the phone's navigation; desktops and tablets have the sidebar.
    expect(screen.queryByTestId('mobile-nav')).toBeNull()
    expect(screen.getByTestId('auth-dialog')).toBeTruthy()
    expect(screen.getByTestId('page-child')).toBeTruthy()
  })

  it('asks for the icon rail on CV Studio only', () => {
    mockPathname.current = '/cv-studio'
    const { unmount } = render(
      <AppShell>
        <div />
      </AppShell>,
    )
    expect(screen.getByTestId('sidebar-provider').getAttribute('data-rail-route')).toBe('true')
    unmount()

    mockPathname.current = '/dashboard'
    render(
      <AppShell>
        <div />
      </AppShell>,
    )
    expect(screen.getByTestId('sidebar-provider').getAttribute('data-rail-route')).toBe('false')
  })

  it('shows the offline banner slot in the shell, and no second sign-in dialog on /login', () => {
    mockPathname.current = '/dashboard'
    const { unmount } = render(
      <AppShell>
        <div />
      </AppShell>,
    )
    expect(screen.getByTestId('service-banner')).toBeTruthy()
    unmount()

    mockPathname.current = '/login'
    render(
      <AppShell>
        <div data-testid="page-child" />
      </AppShell>,
    )
    expect(screen.getByTestId('page-child')).toBeTruthy()
    expect(screen.queryByTestId('auth-dialog')).toBeNull()
  })

  it('starts the sidebar as an icon rail on tablets and expanded on desktops', () => {
    mockPathname.current = '/dashboard'
    mockBreakpoint.current = 'tablet'
    const { unmount } = render(
      <AppShell>
        <div />
      </AppShell>,
    )
    expect(screen.getByTestId('sidebar-provider').getAttribute('data-default-open')).toBe('false')
    unmount()

    mockBreakpoint.current = 'desktop'
    render(
      <AppShell>
        <div />
      </AppShell>,
    )
    expect(screen.getByTestId('sidebar-provider').getAttribute('data-default-open')).toBe('true')
  })

  it('renders no sidebar, and a top bar plus tab bar, on phones', () => {
    mockPathname.current = '/dashboard'
    mockBreakpoint.current = 'mobile'

    render(
      <AppShell>
        <div data-testid="page-child" />
      </AppShell>,
    )

    expect(screen.queryByTestId('app-sidebar')).toBeNull()
    expect(screen.getByTestId('topbar')).toBeTruthy()
    expect(screen.getByTestId('mobile-nav')).toBeTruthy()
  })

  it('renders every layout part while the width is unknown (server render, hydration), for CSS to pick', () => {
    mockPathname.current = '/dashboard'
    mockBreakpoint.current = null

    render(
      <AppShell>
        <div data-testid="page-child" />
      </AppShell>,
    )

    expect(screen.getByTestId('app-sidebar')).toBeTruthy()
    expect(screen.getByTestId('topbar')).toBeTruthy()
    expect(screen.getByTestId('mobile-nav')).toBeTruthy()
    // Desktop is the default until a width is known (tablets start as a rail only once measured).
    expect(screen.getByTestId('sidebar-provider').getAttribute('data-default-open')).toBe('true')
  })

  it('keeps the page mounted when the width becomes known (no remount on a phone after hydration)', () => {
    mockPathname.current = '/dashboard'
    mockBreakpoint.current = null
    const { rerender } = render(
      <AppShell>
        <div data-testid="page-child" />
      </AppShell>,
    )
    const before = screen.getByTestId('page-child')

    mockBreakpoint.current = 'mobile'
    rerender(
      <AppShell>
        <div data-testid="page-child" />
      </AppShell>,
    )

    expect(screen.getByTestId('page-child')).toBe(before)
    expect(screen.queryByTestId('app-sidebar')).toBeNull()
    expect(screen.getByTestId('topbar')).toBeTruthy()
    expect(screen.getByTestId('mobile-nav')).toBeTruthy()
  })

  it('adds a skip link that moves focus to the page main landmark', () => {
    mockPathname.current = '/dashboard'

    render(
      <AppShell>
        <main id="main-content" tabIndex={-1}>
          page
        </main>
      </AppShell>,
    )

    const skip = screen.getByRole('link', { name: 'Skip to main content' })
    expect(skip.getAttribute('href')).toBe('#main-content')
    skip.click()
    expect(document.activeElement?.id).toBe('main-content')
  })

  it('focuses a page main that has no id or tabindex of its own', () => {
    mockPathname.current = '/dashboard'

    render(
      <AppShell>
        <main className="admin-main">page</main>
      </AppShell>,
    )

    screen.getByRole('link', { name: 'Skip to main content' }).click()
    expect(document.activeElement).toBe(screen.getByRole('main'))
  })

  it('leaves the page its own main and never adds a second one', async () => {
    mockPathname.current = '/dashboard'

    render(
      <AppShell>
        <main id="main-content">page</main>
      </AppShell>,
    )

    await waitFor(() => expect(screen.getAllByRole('main')).toHaveLength(1))
    expect(screen.getByRole('main').tagName).toBe('MAIN')
  })

  it('makes the content the main landmark when a page renders none', async () => {
    mockPathname.current = '/dashboard'

    render(
      <AppShell>
        <div data-testid="page-child" />
      </AppShell>,
    )

    await waitFor(() => expect(screen.getAllByRole('main')).toHaveLength(1))
    expect(screen.getByRole('main').id).toBe('main-content')
    expect(screen.getByRole('main').contains(screen.getByTestId('page-child'))).toBe(true)
  })
})
