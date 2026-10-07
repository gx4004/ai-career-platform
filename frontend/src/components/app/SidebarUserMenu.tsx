import { useEffect, useRef, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { ChevronDown, LogIn } from 'lucide-react'
import { AccountMenuContent } from '#/components/app/AccountMenu'
import { Avatar, DropdownMenu, DropdownMenuTrigger } from '#/components/kit'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '#/components/ui/sidebar'
import { useSession } from '#/hooks/useSession'
import { isAccountRoute } from '#/lib/navigation/navGroups'

/** From the rail button's edge past the rail's own edge: (76px rail - 48px button) / 2, its 2px border, a 4px gap. */
const RAIL_MENU_OFFSET = (76 - 48) / 2 + 2 + 4

/** How long after the menu closes the rail's name bubble stays shut: the close hands focus back within it. */
const TOOLTIP_REST_MS = 300

/** Account row at the bottom of the sidebar (desktop has no top bar). */
export function SidebarUserMenu() {
  const { status, user, logout } = useSession()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { state } = useSidebar()
  const rail = state === 'collapsed'
  // Account and Settings live in this menu, so on those pages the account button is the "you are here".
  const here = isAccountRoute(pathname)
  // In the rail the avatar names itself in a bubble on focus. Closing the menu gives focus back to it, and the bubble
  // used to open then and stay over the page: it stays shut while the menu is open and for a moment after it closes.
  const [menuOpen, setMenuOpen] = useState(false)
  const [justClosed, setJustClosed] = useState(false)
  // An item was chosen: the menu leaves focus to the page it opens (or the sign-out), not to the avatar.
  const chose = useRef(false)
  useEffect(() => {
    if (!justClosed) return
    const timer = window.setTimeout(() => setJustClosed(false), TOOLTIP_REST_MS)
    return () => window.clearTimeout(timer)
  }, [justClosed])

  // Until the session answers the slot keeps the account button's height, so the footer does not jump
  // and a signed-in person never sees a "Sign in" button flash up first. 'unreachable' (a signed-in browser
  // that cannot reach the server) is not a guest either: the service banner explains the outage.
  if (status === 'loading' || status === 'unreachable') {
    return <div className="app-sidebar__account-placeholder" aria-hidden="true" />
  }

  if (status !== 'authenticated' || !user) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild tooltip="Sign in">
            <Link to="/login">
              <LogIn aria-hidden />
              <span>Sign in</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  const displayName = user.full_name || user.email

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu
          modal={false}
          open={menuOpen}
          onOpenChange={(next) => {
            setMenuOpen(next)
            if (next) chose.current = false
            else setJustClosed(true)
          }}
        >
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              tooltip={displayName}
              tooltipSuppressed={menuOpen || justClosed}
              isActive={here}
              className="app-sidebar__account"
              aria-label={`Account menu for ${displayName}`}
            >
              <Avatar name={displayName} decorative />
              <span className="app-sidebar__account-name">{displayName}</span>
              <ChevronDown className="app-sidebar__account-chevron" aria-hidden />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          {/* From the 48px rail the menu opens beside it (wide enough for the email), from the footer upward. */}
          <AccountMenuContent
            user={user}
            side={rail ? 'right' : 'top'}
            align={rail ? 'end' : 'start'}
            // The 48px avatar is centred in the 76px rail: clear the rail's ink edge, then the usual 4px gap.
            sideOffset={rail ? RAIL_MENU_OFFSET : undefined}
            className={rail ? 'app-account-menu app-account-menu--rail' : 'app-account-menu'}
            onSignOut={() => void logout()}
            onItemSelect={() => {
              chose.current = true
            }}
            onCloseAutoFocus={(event) => {
              if (!chose.current) return
              chose.current = false
              event.preventDefault()
            }}
          />
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
