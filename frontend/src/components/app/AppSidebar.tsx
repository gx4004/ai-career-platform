import { Link, useRouterState } from '@tanstack/react-router'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { AppBrandLockup } from '#/components/app/AppBrandLockup'
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
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from '#/components/ui/sidebar'
import { cn } from '#/lib/utils'
import { toolList } from '#/lib/tools/registry'
import { toolAccentStyle } from '#/lib/tools/styleUtils'
import { navGroups } from '#/lib/navigation/navGroups'
import type { NavDestination } from '#/lib/navigation/navGroups'

const accountNavItems = [
  { label: 'Account', icon: UserRound, route: '/account' },
  { label: 'Settings', icon: Settings, route: '/settings' },
] as const

export function AppSidebar() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const { user } = useSession()
  const { isMobile, state } = useSidebar()
  const isCollapsedDesktop = !isMobile && state === 'collapsed'
  const isDesktopToolRoute =
    !isMobile && toolList.some((tool) => pathname === tool.route)
  const visibleGroup = (id: string) =>
    navGroups.find((candidate) => candidate.id === id)?.destinations ?? []
  // "Job search" stays owner-only, same as the old "Opportunities" group.
  // "You" (CV Studio, Profile, History) keeps rendering for guests, same as
  // the old "Career Tools" + footer items did before the regroup.
  const jobSearchDestinations = user ? visibleGroup('job-search') : []
  const youDestinations = visibleGroup('you')

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
            <AppBrandLockup mode={isCollapsedDesktop ? 'compact' : 'full'} />
          </Link>
          {isDesktopToolRoute ? null : (
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
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {isDesktopToolRoute ? (
          <div className="app-sidebar-tool-back-row">
            <Link
              to="/dashboard"
              className="app-sidebar-tool-back"
              aria-label="Back to dashboard"
              title="Back to dashboard"
            >
              <ArrowLeft className="app-sidebar-tool-back-icon" />
            </Link>
          </div>
        ) : null}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Dashboard"
                  isActive={pathname.startsWith('/dashboard')}
                  className="app-sidebar-menu-button"
                >
                  <Link to="/dashboard">
                    <LayoutDashboard className="app-sidebar-item-icon" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator />
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
                    style={toolAccentStyle(tool.accent)}
                    className="app-sidebar-menu-button"
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
        <NavGroupSection label="Job search" destinations={jobSearchDestinations} pathname={pathname} />
        <NavGroupSection label="You" destinations={youDestinations} pathname={pathname} />
      </SidebarContent>
      <SidebarFooter className="app-sidebar-footer">
        <SidebarSeparator />
        <SidebarMenu>
          {accountNavItems.map((item) => (
            <SidebarMenuItem key={item.route}>
              <SidebarMenuButton
                asChild
                tooltip={item.label}
                isActive={pathname.startsWith(item.route)}
                className="app-sidebar-menu-button app-sidebar-menu-button--footer"
              >
                <Link to={item.route}>
                  <item.icon className="app-sidebar-item-icon" />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          {user?.is_admin && (
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip="Admin"
                isActive={pathname.startsWith('/admin')}
                className="app-sidebar-menu-button app-sidebar-menu-button--footer"
              >
                <Link to="/admin">
                  <ShieldCheck className="app-sidebar-item-icon" />
                  <span>Admin</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
        <div className="app-sidebar-legal group-data-[collapsible=icon]:hidden" aria-label="Legal">
          <Link to="/privacy" className="app-sidebar-legal__link">Privacy</Link>
          <span className="app-sidebar-legal__sep" aria-hidden="true">·</span>
          <Link to="/terms" className="app-sidebar-legal__link">Terms</Link>
          <span className="app-sidebar-legal__sep" aria-hidden="true">·</span>
          <Link to="/cookies" className="app-sidebar-legal__link">Cookies</Link>
        </div>
      </SidebarFooter>
      {isDesktopToolRoute ? null : <SidebarRail />}
    </Sidebar>
  )
}

function NavGroupSection({
  label,
  destinations,
  pathname,
}: {
  label: string
  destinations: NavDestination[]
  pathname: string
}) {
  if (destinations.length === 0) return null
  return (
    <>
      <SidebarSeparator />
      <SidebarGroup>
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
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
    </>
  )
}
