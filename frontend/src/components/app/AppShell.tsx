import type { ReactNode } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { ErrorBoundary } from '#/components/app/ErrorBoundary'
import { AppSidebar } from '#/components/app/AppSidebar'
import { MobileNav } from '#/components/app/MobileNav'
import { Topbar } from '#/components/app/Topbar'
import { AuthDialog } from '#/components/auth/AuthDialog'
import { SidebarInset, SidebarProvider } from '#/components/ui/sidebar'
import { TooltipProvider } from '#/components/ui/tooltip'
import { isPublicRoute } from '#/lib/navigation/publicRoutes'
import { useBreakpoint } from '#/hooks/use-breakpoint'

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const bp = useBreakpoint()
  const isShellless = isPublicRoute(pathname)
  const isMobile = bp === 'mobile'

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

  // Mobile: no sidebar, no desktop topbar — just content + bottom tab bar
  if (isMobile) {
    return (
      <TooltipProvider delayDuration={120}>
        <SidebarProvider defaultOpen={false}>
          <div className="app-main app-main--mobile">
            <Topbar />
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
          <MobileNav />
          <AuthDialog />
        </SidebarProvider>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider delayDuration={120}>
      <SidebarProvider defaultOpen={pathname !== '/dashboard'}>
        <AppSidebar />
        <SidebarInset>
          <div className="app-main">
            <Topbar />
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </SidebarInset>
        <MobileNav />
        <AuthDialog />
      </SidebarProvider>
    </TooltipProvider>
  )
}
