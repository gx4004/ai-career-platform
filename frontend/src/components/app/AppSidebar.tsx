import { Link, useRouterState } from '@tanstack/react-router'
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Search,
} from 'lucide-react'
import { AppBrandLockup } from '#/components/app/AppBrandLockup'
import { openCommandPalette } from '#/components/app/CommandPalette'
import { SidebarUserMenu } from '#/components/app/SidebarUserMenu'
import { useSession } from '#/hooks/useSession'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '#/components/ui/sidebar'
import { cn } from '#/lib/utils'
import { toolList } from '#/lib/tools/registry'
import { navGroups } from '#/lib/navigation/navGroups'
import type { NavDestination } from '#/lib/navigation/navGroups'

export function AppSidebar() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const { user } = useSession()
  const { isMobile, state } = useSidebar()
  const isCollapsedDesktop = !isMobile && state === 'collapsed'
  const group = (id: string) =>
    navGroups.find((candidate) => candidate.id === id)?.destinations ?? []
  // Job search stays owner-only. The rest renders for guests too.
  const you = group('you')
  const history = you.filter((item) => item.route === '/history')
  const mainDestinations: NavDestination[] = [
    { label: 'Dashboard', route: '/dashboard', icon: LayoutDashboard },
    ...(user ? group('job-search') : []),
    ...you.filter((item) => item.route !== '/history'),
  ]

  return (
    <Sidebar className="app-sidebar-shell" collapsible="icon">
      <SidebarHeader className="app-sidebar-header">
        <div
          className={cn(
            'app-sidebar-brand-row',
            isCollapsedDesktop && 'is-collapsed',
          )}
        >
          <Link
            to={pathname === '/dashboard' ? '/' : '/dashboard'}
            className="app-sidebar-brand-link"
            aria-label="Career Workbench"
          >
            <AppBrandLockup mode="compact" />
            {isCollapsedDesktop ? null : <span className="app-sidebar-brand-name">Career Workbench</span>}
          </Link>
          <SidebarTrigger
            className="app-sidebar-brand-toggle"
            title={isCollapsedDesktop ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsedDesktop ? (
              <ChevronRight className="app-sidebar-brand-toggle-icon" />
            ) : (
              <ChevronLeft className="app-sidebar-brand-toggle-icon" />
            )}
          </SidebarTrigger>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Search (⌘K)"
              className="app-sidebar-menu-button app-sidebar-search"
              onClick={openCommandPalette}
            >
              <Search className="app-sidebar-item-icon" />
              <span>Search</span>
              <kbd className="app-sidebar-kbd">⌘K</kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavGroupSection destinations={mainDestinations} pathname={pathname} />
        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {toolList.map((tool) => (
                <SidebarMenuItem key={tool.id}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(tool.route)}
                    tooltip={tool.label}
                    className="app-sidebar-menu-button app-sidebar-menu-button--tool"
                  >
                    <Link to={tool.route}>
                      <tool.icon className="app-sidebar-item-icon" />
                      <span>{tool.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <NavGroupSection destinations={history} pathname={pathname} />
      </SidebarContent>
      <SidebarFooter className="app-sidebar-footer">
        <SidebarUserMenu />
        <div className="app-sidebar-legal group-data-[collapsible=icon]:hidden" aria-label="Legal">
          <Link to="/privacy" className="app-sidebar-legal__link">Privacy</Link>
          <span className="app-sidebar-legal__sep" aria-hidden="true">·</span>
          <Link to="/terms" className="app-sidebar-legal__link">Terms</Link>
          <span className="app-sidebar-legal__sep" aria-hidden="true">·</span>
          <Link to="/cookies" className="app-sidebar-legal__link">Cookies</Link>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function NavGroupSection({
  label,
  destinations,
  pathname,
}: {
  label?: string
  destinations: NavDestination[]
  pathname: string
}) {
  if (destinations.length === 0) return null
  return (
    <SidebarGroup>
      {label ? <SidebarGroupLabel>{label}</SidebarGroupLabel> : null}
      <SidebarGroupContent>
        <SidebarMenu>
          {destinations.map((item) => (
            <SidebarMenuItem key={item.route}>
              <SidebarMenuButton
                asChild
                tooltip={item.label}
                isActive={pathname.startsWith(item.route)}
                className="app-sidebar-menu-button"
              >
                <Link to={item.route}>
                  <item.icon className="app-sidebar-item-icon" />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
