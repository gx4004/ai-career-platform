import { Link, useRouterState } from '@tanstack/react-router'
import { LayoutDashboard, Search } from 'lucide-react'
import { AppBrandLockup } from '#/components/app/AppBrandLockup'
import { openCommandPalette } from '#/components/app/CommandPalette'
import { SidebarUserMenu } from '#/components/app/SidebarUserMenu'
import { Button, Kbd } from '#/components/kit'
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
  SidebarTooltip,
  SidebarTrigger,
  useSidebar,
} from '#/components/ui/sidebar'
import { useSession } from '#/hooks/useSession'
import { toolList } from '#/lib/tools/registry'
import { navGroups } from '#/lib/navigation/navGroups'
import type { NavDestination } from '#/lib/navigation/navGroups'

export function AppSidebar() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const { user } = useSession()
  const { state } = useSidebar()
  const collapsed = state === 'collapsed'
  const group = (id: string) => navGroups.find((candidate) => candidate.id === id)?.destinations ?? []
  // Job search stays owner-only. The rest renders for guests too.
  const you = group('you')
  const history = you.filter((item) => item.route === '/history')
  const mainDestinations: NavDestination[] = [
    { label: 'Dashboard', route: '/dashboard', icon: LayoutDashboard },
    ...(user ? group('job-search') : []),
    ...you.filter((item) => item.route !== '/history'),
  ]

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="app-sidebar__brand-row">
          <Link
            to={pathname === '/dashboard' ? '/' : '/dashboard'}
            className="app-sidebar__brand"
            aria-label="Career Workbench"
          >
            <AppBrandLockup mode={collapsed ? 'compact' : 'full'} />
          </Link>
          <SidebarTrigger />
        </div>
        <SidebarTooltip tooltip="Search" shortcut="⌘K">
          <Button
            variant="secondary"
            className="app-sidebar__search"
            aria-label="Search"
            aria-keyshortcuts="Meta+K Control+K"
            onClick={openCommandPalette}
          >
            <Search aria-hidden />
            <span className="app-sidebar__search-label">Search</span>
            <Kbd className="app-sidebar__search-kbd">⌘K</Kbd>
          </Button>
        </SidebarTooltip>
      </SidebarHeader>
      <SidebarContent>
        <NavGroup destinations={mainDestinations} pathname={pathname} />
        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {toolList.map((tool) => (
                <SidebarMenuItem key={tool.id}>
                  <SidebarMenuButton asChild isActive={pathname.startsWith(tool.route)} tooltip={tool.label}>
                    <Link to={tool.route}>
                      <tool.icon aria-hidden />
                      <span>{tool.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <NavGroup destinations={history} pathname={pathname} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarUserMenu />
        <nav className="app-sidebar__legal" aria-label="Legal">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/cookies">Cookies</Link>
        </nav>
      </SidebarFooter>
    </Sidebar>
  )
}

function NavGroup({ destinations, pathname }: { destinations: NavDestination[]; pathname: string }) {
  if (destinations.length === 0) return null
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {destinations.map((item) => (
            <SidebarMenuItem key={item.route}>
              <SidebarMenuButton asChild tooltip={item.label} isActive={pathname.startsWith(item.route)}>
                <Link to={item.route}>
                  <item.icon aria-hidden />
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
