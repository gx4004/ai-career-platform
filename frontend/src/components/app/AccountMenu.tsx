import { Link } from '@tanstack/react-router'
import { LogOut, Settings, ShieldCheck, UserRound } from 'lucide-react'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '#/components/kit'
import type { DropdownMenuContentProps } from '#/components/kit'
import type { User } from '#/lib/api/schemas'

/**
 * The account menu body shared by the sidebar footer (desktop) and the top bar (phones):
 * who is signed in (name 15/700, email 13), Account, Settings, Admin for admins, Sign out.
 */
export function AccountMenuContent({
  user,
  onSignOut,
  ...props
}: DropdownMenuContentProps & { user: User; onSignOut: () => void }) {
  const name = user.full_name?.trim()
  return (
    <DropdownMenuContent {...props}>
      <DropdownMenuLabel className="app-account__who">
        {/* Long names and addresses are clipped by CSS (two lines, one line); the title keeps the whole text. */}
        {name ? (
          <span className="app-account__name" title={name}>
            {name}
          </span>
        ) : null}
        <span className="app-account__email" title={user.email}>
          {user.email}
        </span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild icon={<UserRound />}>
        <Link to="/account">Account</Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild icon={<Settings />}>
        <Link to="/settings">Settings</Link>
      </DropdownMenuItem>
      {user.is_admin ? (
        <DropdownMenuItem asChild icon={<ShieldCheck />}>
          <Link to="/admin">Admin</Link>
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={<LogOut />} onSelect={onSignOut}>
        Sign out
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}
