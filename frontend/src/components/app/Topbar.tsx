import { Link, useRouterState } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { AccountMenuContent } from '#/components/app/AccountMenu'
import { AppBrandLockup } from '#/components/app/AppBrandLockup'
import { openCommandPalette } from '#/components/app/CommandPalette'
import { Avatar, Button, DropdownMenu, DropdownMenuTrigger } from '#/components/kit'
import { useSession } from '#/hooks/useSession'

/**
 * The phone's top bar: the brand on the left; on the right the search button (it opens the same palette as
 * ⌘K) and, once signed in, the account menu (guests sign in from the tab bar). Desktop and tablets have no
 * top bar: the sidebar carries both, and the page title is the page's own header.
 */
export function Topbar() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const { status, user, logout } = useSession()

  const displayName = user ? user.full_name || user.email : ''

  return (
    <header className="app-topbar">
      <Link
        to={pathname === '/dashboard' ? '/' : '/dashboard'}
        className="app-topbar__brand"
        aria-label="Career Workbench home"
      >
        <AppBrandLockup />
      </Link>
      <div className="app-topbar__end">
        <Button
          iconOnly
          variant="secondary"
          aria-label="Search"
          aria-haspopup="dialog"
          onClick={openCommandPalette}
        >
          <Search aria-hidden />
        </Button>
        {status === 'authenticated' && user ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button iconOnly variant="ghost" aria-label={`Account menu for ${displayName}`}>
                <Avatar name={displayName} size="lg" decorative />
              </Button>
            </DropdownMenuTrigger>
            <AccountMenuContent user={user} align="end" onSignOut={() => void logout()} />
          </DropdownMenu>
        ) : null}
      </div>
    </header>
  )
}
