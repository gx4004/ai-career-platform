import { Link, useRouterState } from '@tanstack/react-router'
import { History, LayoutDashboard, Settings, UserRound } from 'lucide-react'
import { AppBrandLockup } from '#/components/app/AppBrandLockup'
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

export function AppSidebar() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const { isMobile, state } = useSidebar()
  const isCollapsedDesktop = !isMobile && state === 'collapsed'

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="app-sidebar-header">
        <div
          className={cn(
            'app-sidebar-brand-row',
            isCollapsedDesktop && 'is-collapsed',
          )}
        >
          <Link
            to="/dashboard"
            className="app-sidebar-brand-link"
            aria-label="Career Workbench"
          >
            <AppBrandLockup mode={isCollapsedDesktop ? 'compact' : 'full'} />
          </Link>
          <SidebarTrigger
            className="app-sidebar-brand-toggle button-toolbar-utility"
            title={isCollapsedDesktop ? 'Expand sidebar' : 'Collapse sidebar'}
          />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Dashboard"
                  isActive={pathname.startsWith('/dashboard')}
                >
                  <Link to="/dashboard">
                    <LayoutDashboard size={18} />
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
              {toolList.map((tool) => (
                <SidebarMenuItem key={tool.id}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(tool.route)}
                    tooltip={tool.label}
                    style={toolAccentStyle(tool.accent)}
                  >
                    <Link to={tool.route}>
                      <tool.icon size={18} />
                      <span>{tool.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="app-sidebar-footer">
        <SidebarSeparator />
        <SidebarMenu>
          {[
            { label: 'History', icon: History, route: '/history' },
            { label: 'Account', icon: UserRound, route: '/account' },
            { label: 'Settings', icon: Settings, route: '/settings' },
          ].map((item) => (
            <SidebarMenuItem key={item.route}>
              <SidebarMenuButton
                asChild
                tooltip={item.label}
                isActive={pathname.startsWith(item.route)}
              >
                <Link to={item.route}>
                  <item.icon size={16} />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
