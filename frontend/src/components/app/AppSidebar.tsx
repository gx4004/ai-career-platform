import { Link, useRouterState } from '@tanstack/react-router'
import {
  ArrowLeft,
  BadgeCheck,
  Compass,
  ClipboardCheck,
  ChevronLeft,
  ChevronRight,
  History,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Sprout,
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
import { registryEntries, toolList } from '#/lib/tools/registry'
import { toolAccentStyle } from '#/lib/tools/styleUtils'
import {
  isR11EvidenceProfileEnabled,
  isR12CvStudioEnabled,
  isR14DiscoveryEnabled,
  isR15QueueEnabled,
  isR17DevelopmentLoopEnabled,
} from '#/lib/flags/featureFlags'

const accountNavItems = [
  { label: 'History', icon: History, route: '/history' },
  { label: 'Evidence', icon: BadgeCheck, route: '/profile' },
  { label: 'Account', icon: UserRound, route: '/account' },
  { label: 'Settings', icon: Settings, route: '/settings' },
] as const

const authenticatedNavItems = [
  { label: 'Discover', icon: Compass, route: '/discovery' },
  { label: 'Queue', icon: ClipboardCheck, route: '/queue' },
  { label: 'Development', icon: Sprout, route: '/development-plan' },
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
  const visibleRegistryEntries = registryEntries.filter(
    (entry) => entry.id !== 'cv-studio' || isR12CvStudioEnabled(),
  )
  const visibleAccountNavItems = accountNavItems.filter(
    (item) => item.route !== '/profile' || isR11EvidenceProfileEnabled(),
  )
  const visibleAuthenticatedNavItems = authenticatedNavItems.filter((item) => {
    if (item.route === '/discovery') return isR14DiscoveryEnabled()
    if (item.route === '/queue') return isR15QueueEnabled()
    if (item.route === '/development-plan') return isR17DevelopmentLoopEnabled()
    return true
  })

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
          <SidebarGroupLabel>Career Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleRegistryEntries.map((tool) => (
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
        {user ? (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>Opportunities</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleAuthenticatedNavItems.map((item) => (
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
        ) : null}
      </SidebarContent>
      <SidebarFooter className="app-sidebar-footer">
        <SidebarSeparator />
        <SidebarMenu>
          {visibleAccountNavItems.map((item) => (
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
