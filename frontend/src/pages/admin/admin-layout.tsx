import { useState } from 'react'
import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { ArrowLeft, Database, FileText, LayoutDashboard, Menu, Users } from 'lucide-react'
import { AppBrandLockup } from '#/components/app/AppBrandLockup'
import {
  Button,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '#/components/kit'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '#/components/ui/sidebar'
import { useBreakpoint } from '#/hooks/use-breakpoint'

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/discovery-sources', label: 'Discovery sources', icon: Database },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/runs', label: 'Runs', icon: FileText },
] as const

function isActive(pathname: string, to: string) {
  return to === '/admin' ? pathname === '/admin' || pathname === '/admin/' : pathname.startsWith(to)
}

/** The same sidebar the app has (width, brand row, collapse, active row), with the admin destinations in it. */
function AdminSidebar({ pathname }: { pathname: string }) {
  const { state } = useSidebar()
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="app-sidebar__brand-row">
          <Link to="/dashboard" className="app-sidebar__brand" aria-label="Career Workbench, back to the app">
            <AppBrandLockup mode={state === 'collapsed' ? 'compact' : 'full'} />
          </Link>
          <SidebarTrigger />
        </div>
      </SidebarHeader>
      <SidebarContent aria-label="Admin navigation">
        <SidebarGroup>
          <SidebarGroupLabel>Admin</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild isActive={isActive(pathname, item.to)} tooltip={item.label}>
                    <Link to={item.to}>
                      <item.icon aria-hidden />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Back to app">
              <Link to="/dashboard">
                <ArrowLeft aria-hidden />
                <span>Back to app</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

/** Phones: the app's top bar, with the admin destinations in a sheet so none of them is clipped. */
function AdminTopbar({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false)
  return (
    <header className="app-topbar">
      <Link to="/dashboard" className="app-topbar__brand" aria-label="Career Workbench, back to the app">
        <AppBrandLockup mode="compact" />
      </Link>
      <p className="admin-topbar__label">Admin</p>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button iconOnly variant="ghost" aria-label="Admin navigation">
            <Menu aria-hidden />
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" size="sm">
          <SheetHeader>
            <SheetTitle>Admin</SheetTitle>
            <SheetDescription visuallyHidden>Go to another admin page, or back to the app.</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <nav aria-label="Admin navigation">
              <SidebarMenu>
                {NAV.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={isActive(pathname, item.to)}>
                      <Link to={item.to} onClick={() => setOpen(false)}>
                        <item.icon aria-hidden />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link to="/dashboard">
                      <ArrowLeft aria-hidden />
                      <span>Back to app</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </nav>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </header>
  )
}

export function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const bp = useBreakpoint()

  if (bp === 'mobile') {
    return (
      <div className="app-main app-main--mobile">
        <AdminTopbar pathname={pathname} />
        <Outlet />
      </div>
    )
  }

  return (
    <SidebarProvider defaultOpen={bp === 'desktop'}>
      <Button asChild className="app-skip-link">
        <a href="#main-content">Skip to main content</a>
      </Button>
      <AdminSidebar pathname={pathname} />
      <SidebarInset>
        <div className="app-main">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
