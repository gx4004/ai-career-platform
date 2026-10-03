import { Link } from '@tanstack/react-router'
import { ChevronsUpDown, LogIn } from 'lucide-react'
import { AccountMenuContent } from '#/components/app/AccountMenu'
import { Avatar, DropdownMenu, DropdownMenuTrigger } from '#/components/kit'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '#/components/ui/sidebar'
import { useSession } from '#/hooks/useSession'

/** Account row at the bottom of the sidebar (desktop has no top bar). */
export function SidebarUserMenu() {
  const { status, user, logout } = useSession()

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
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              tooltip={displayName}
              className="app-sidebar__account"
              aria-label={`Account menu for ${displayName}`}
            >
              <Avatar name={displayName} size="sm" decorative />
              <span className="app-sidebar__account-name">{displayName}</span>
              <ChevronsUpDown className="app-sidebar__account-chevron" aria-hidden />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <AccountMenuContent
            user={user}
            side="top"
            align="start"
            className="app-account-menu"
            onSignOut={() => void logout()}
          />
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
