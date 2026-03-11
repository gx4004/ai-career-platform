import type { ReactNode } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { CommandPalette } from '#/components/app/CommandPalette'
import { AppSidebar } from '#/components/app/AppSidebar'
import { MobileNav } from '#/components/app/MobileNav'
import { Topbar } from '#/components/app/Topbar'
import { AuthDialog } from '#/components/auth/AuthDialog'
import { SidebarInset, SidebarProvider } from '#/components/ui/sidebar'
import { TooltipProvider } from '#/components/ui/tooltip'

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const isShellless =
    pathname === '/' || pathname === '/login' || pathname.startsWith('/auth/')

  if (isShellless) {
    return (
      <TooltipProvider delayDuration={120}>
        <>
          {children}
          <AuthDialog />
        </>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider delayDuration={120}>
      <SidebarProvider defaultOpen={false}>
        <AppSidebar />
        <SidebarInset>
          <div className="app-main">
            <Topbar />
            {children}
          </div>
        </SidebarInset>
        <MobileNav />
        <AuthDialog />
        <CommandPalette />
      </SidebarProvider>
    </TooltipProvider>
  )
}
