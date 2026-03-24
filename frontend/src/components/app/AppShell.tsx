import type { ReactNode } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { CommandPalette } from '#/components/app/CommandPalette'
import { ErrorBoundary } from '#/components/app/ErrorBoundary'
import { AppSidebar } from '#/components/app/AppSidebar'
import { MobileNav } from '#/components/app/MobileNav'
import { Topbar } from '#/components/app/Topbar'
import { AuthDialog } from '#/components/auth/AuthDialog'
import { SidebarInset, SidebarProvider } from '#/components/ui/sidebar'
import { TooltipProvider } from '#/components/ui/tooltip'
import { isPublicRoute } from '#/lib/navigation/publicRoutes'

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const isShellless = isPublicRoute(pathname)

  if (isShellless) {
    return (
      <TooltipProvider delayDuration={120}>
        <ErrorBoundary>
          {children}
          <AuthDialog />
        </ErrorBoundary>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider delayDuration={120}>
      <SidebarProvider defaultOpen={pathname === '/dashboard'}>
        <AppSidebar />
        <SidebarInset>
          <div className="app-main">
            <Topbar />
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </SidebarInset>
        <MobileNav />
        <AuthDialog />
        <CommandPalette />
      </SidebarProvider>
    </TooltipProvider>
  )
}
