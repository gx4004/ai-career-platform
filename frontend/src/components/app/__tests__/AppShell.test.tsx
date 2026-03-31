import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from '#/components/app/AppShell'

const mockPathname = vi.hoisted(() => ({ current: '/' }))

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

vi.mock('#/components/app/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('#/components/app/AppSidebar', () => ({
  AppSidebar: () => <div data-testid="app-sidebar" />,
}))

vi.mock('#/components/app/MobileNav', () => ({
  MobileNav: () => <div data-testid="mobile-nav" />,
}))

vi.mock('#/components/app/Topbar', () => ({
  Topbar: () => <div data-testid="topbar" />,
}))

vi.mock('#/components/auth/AuthDialog', () => ({
  AuthDialog: () => <div data-testid="auth-dialog" />,
}))

vi.mock('#/components/ui/sidebar', () => ({
  SidebarProvider: ({
    children,
    defaultOpen,
  }: {
    children: ReactNode
    defaultOpen?: boolean
  }) => (
    <div data-testid="sidebar-provider" data-default-open={String(Boolean(defaultOpen))}>
      {children}
    </div>
  ),
  SidebarInset: ({ children }: { children: ReactNode }) => (
    <div data-testid="sidebar-inset">{children}</div>
  ),
}))

vi.mock('#/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="tooltip-provider">{children}</div>
  ),
}))

describe('AppShell', () => {
  beforeEach(() => {
    mockPathname.current = '/'
  })

  it('renders the stable landing route without the workspace shell', () => {
    render(
      <AppShell>
        <div data-testid="page-child" />
      </AppShell>,
    )

    expect(screen.getByTestId('tooltip-provider')).toBeTruthy()
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

  it('keeps dashboard routes inside the workspace shell', () => {
    mockPathname.current = '/dashboard'

    render(
      <AppShell>
        <div data-testid="page-child" />
      </AppShell>,
    )

    expect(screen.getByTestId('sidebar-provider').getAttribute('data-default-open')).toBe('false')
    expect(screen.getByTestId('app-sidebar')).toBeTruthy()
    expect(screen.getByTestId('sidebar-inset')).toBeTruthy()
    expect(screen.getByTestId('topbar')).toBeTruthy()
    expect(screen.getByTestId('mobile-nav')).toBeTruthy()
    expect(screen.getByTestId('auth-dialog')).toBeTruthy()
    expect(screen.getByTestId('page-child')).toBeTruthy()
  })
})
