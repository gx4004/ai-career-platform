import { Fragment, useLayoutEffect, useRef } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { AppBrandLockup } from '#/components/app/AppBrandLockup'
import { openCommandPalette } from '#/components/app/CommandPalette'
import { SidebarUserMenu } from '#/components/app/SidebarUserMenu'
import { Button, Kbd, ToolTile } from '#/components/kit'
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
import { useShortcutLabel } from '#/hooks/use-mod-key'
import { useSession } from '#/hooks/useSession'
import { toolList } from '#/lib/tools/registry'
import { dashboardDestination, navGroups } from '#/lib/navigation/navGroups'
import type { NavDestination } from '#/lib/navigation/navGroups'

/** Room kept between the active item and the list's edge: the height of the edge fade (shell.css). */
const ACTIVE_CLEARANCE = 32

export function AppSidebar() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const { user, status } = useSession()
  const { state } = useSidebar()
  const collapsed = state === 'collapsed'
  const searchShortcut = useShortcutLabel('K')
  const contentRef = useRef<HTMLElement | null>(null)
  // While the session resolves we do not know yet whether Discover and Applications belong here: a guest
  // set that swaps a moment later reads as being signed out, so those two rows are placeholders. The same
  // while a signed-in browser cannot reach the server ('unreachable'): it is not a guest.
  const resolving = status === 'loading' || status === 'unreachable'
  // On a short screen the list scrolls: the page you are on must be in view, or nothing says "you are here".
  // The list scrolls itself (never the window), and clears the edge fade so the item is not drawn under it.
  // Again when the session answers (Discover and Applications replace their placeholders above the item) and
  // once the fonts are in (the rows' height can still change then).
  const lastCollapsed = useRef(collapsed)
  useLayoutEffect(() => {
    // Rail and expanded rows differ in height: after a switch the offset is worked out afresh, not kept.
    if (lastCollapsed.current !== collapsed && contentRef.current) contentRef.current.scrollTop = 0
    lastCollapsed.current = collapsed
    const reveal = () => {
      const content = contentRef.current
      const active = content?.querySelector<HTMLElement>('[data-active="true"]')
      if (!content || !active) return
      const box = content.getBoundingClientRect()
      const item = active.getBoundingClientRect()
      if (item.top < box.top + ACTIVE_CLEARANCE) content.scrollTop -= box.top + ACTIVE_CLEARANCE - item.top
      else if (item.bottom > box.bottom - ACTIVE_CLEARANCE) content.scrollTop += item.bottom - (box.bottom - ACTIVE_CLEARANCE)
    }
    reveal()
    let live = true
    void document.fonts?.ready.then(() => {
      if (live) reveal()
    })
    return () => {
      live = false
    }
  }, [pathname, collapsed, resolving])
  const group = (id: string) => navGroups.find((candidate) => candidate.id === id)?.destinations ?? []
  // Job search stays owner-only. The rest renders for guests too.
  const you = group('you')
  const history = you.filter((item) => item.route === '/history')
  const mainDestinations: NavDestination[] = [
    dashboardDestination,
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
        </div>
        <SidebarTooltip tooltip="Search" shortcut={searchShortcut}>
          <Button
            variant="secondary"
            className="app-sidebar__search"
            aria-label="Search"
            aria-keyshortcuts="Meta+K Control+K"
            onClick={openCommandPalette}
          >
            <Search aria-hidden />
            <span className="app-sidebar__search-label">Search</span>
            <Kbd className="app-sidebar__search-kbd">{searchShortcut}</Kbd>
          </Button>
        </SidebarTooltip>
      </SidebarHeader>
      <SidebarContent ref={contentRef}>
        <SidebarGroup>
          <NavGroup destinations={mainDestinations} pathname={pathname} placeholders={resolving ? 2 : 0} />
        </SidebarGroup>
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
                    className="app-sidebar__button--tool"
                  >
                    <Link to={tool.route}>
                      <ToolTile tone={tool.tone} icon={tool.icon} size="sm" />
                      <span>{tool.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Also</SidebarGroupLabel>
          <NavGroup destinations={history} pathname={pathname} tool />
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarTrigger />
        <SidebarUserMenu />
        <nav className="app-sidebar__legal" aria-label="Legal">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/cookies">Cookies</Link>
          <Link to="/imprint">Imprint</Link>
        </nav>
      </SidebarFooter>
    </Sidebar>
  )
}

function NavGroup({
  destinations,
  pathname,
  placeholders = 0,
  tool = false,
}: {
  destinations: NavDestination[]
  pathname: string
  /** Rows held back while the session resolves, so the list does not jump when Discover and Applications arrive. */
  placeholders?: number
  /** The 40px row height of the Tools list (History sits under "Also" at that height). */
  tool?: boolean
}) {
  if (destinations.length === 0) return null
  return (
    <SidebarGroupContent>
      <SidebarMenu>
        {destinations.map((item, index) => (
          <Fragment key={item.route}>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip={item.label}
                isActive={pathname.startsWith(item.route)}
                className={tool ? 'app-sidebar__button--tool' : undefined}
              >
                <Link to={item.route}>
                  <item.icon aria-hidden />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {/* The placeholders take the place the owner-only rows will fill: right after Dashboard. */}
            {index === 0
              ? Array.from({ length: placeholders }, (_, slot) => (
                  <li key={`placeholder-${slot}`} className="app-sidebar__placeholder" aria-hidden="true" />
                ))
              : null}
          </Fragment>
        ))}
      </SidebarMenu>
    </SidebarGroupContent>
  )
}
