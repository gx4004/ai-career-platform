import { Link } from '@tanstack/react-router'
import { ChevronsUpDown, LogIn, LogOut, Settings2, ShieldCheck, UserRound } from 'lucide-react'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '#/components/ui/sidebar'
import { useSession } from '#/hooks/useSession'

function initials(name: string) {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

/** Account row at the bottom of the sidebar (replaces the desktop topbar menu). */
export function SidebarUserMenu() {
  const { status, user, logout } = useSession()

  if (status !== 'authenticated' || !user) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild tooltip="Sign in" className="app-sidebar-menu-button">
            <Link to="/login">
              <LogIn className="app-sidebar-item-icon" />
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              tooltip={displayName}
              className="app-sidebar-menu-button app-sidebar-user"
              aria-label={`Account menu for ${displayName}`}
            >
              <Avatar className="app-sidebar-user__avatar">
                <AvatarFallback>{initials(displayName)}</AvatarFallback>
              </Avatar>
              <span className="app-sidebar-user__name">{displayName}</span>
              <ChevronsUpDown className="app-sidebar-user__chevron" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="app-sidebar-user__menu">
            <DropdownMenuLabel className="grid gap-0.5">
              <span>{displayName}</span>
              <span className="small-copy muted-copy">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/account">
                <UserRound size={14} />
                Account
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/settings">
                <Settings2 size={14} />
                Settings
              </Link>
            </DropdownMenuItem>
            {user.is_admin ? (
              <DropdownMenuItem asChild>
                <Link to="/admin">
                  <ShieldCheck size={14} />
                  Admin
                </Link>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout}>
              <LogOut size={14} />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
