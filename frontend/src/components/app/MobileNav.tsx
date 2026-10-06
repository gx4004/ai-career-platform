import { useState, useEffect } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { LayoutGrid, LogIn } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ToolGridSheet } from '#/components/mobile/ToolGridSheet'
import { isPublicRoute } from '#/lib/navigation/publicRoutes'
import { toolList } from '#/lib/tools/registry'
import { useSession } from '#/hooks/useSession'
import { dashboardDestination, getNavDestination } from '#/lib/navigation/navGroups'
import { openCommandPalette } from '#/components/app/CommandPalette'

// Same icon + label as the sidebar and the More sheet (shared navGroups).
const discover = getNavDestination('/discovery')
const applications = getNavDestination('/campaigns')
const cvStudio = getNavDestination('/cv-studio')
const history = getNavDestination('/history')

/**
 * `short` is what the label shrinks to on the narrowest phones (320px: five tabs leave 53px of text, and
 * "Applications" is 66px at 12px). The full word stays in the DOM, so the tab keeps its accessible name.
 */
function TabLink({
  to,
  icon: Icon,
  label,
  short,
  active,
}: {
  to: string
  icon: LucideIcon
  label: string
  short?: string
  active: boolean
}) {
  return (
    <Link
      to={to}
      className="app-tabbar__item"
      data-active={active}
      aria-current={active ? 'page' : undefined}
      aria-label={short ? label : undefined}
    >
      <Icon aria-hidden />
      <span data-short={short}>{label}</span>
    </Link>
  )
}

export function MobileNav() {
  const [moreOpen, setMoreOpen] = useState(false)
  const { status, user, openAuthDialog } = useSession()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  // Close the sheet on navigation (handles keyboard and middle-click).
  useEffect(() => {
    setMoreOpen(false)
  }, [pathname])

  // Not on public routes (landing, standalone login). Which widths get the tray is the shell's choice
  // (AppShell, and styles/shell.css before the page knows its width).
  if (isPublicRoute(pathname)) return null
  // Until the session answers (or while a signed-in browser cannot reach the server) the two account-
  // dependent tabs hold their place, so a signed-in person never sees the guest tabs flash first.
  const resolving = status === 'loading' || status === 'unreachable'

  const isActive = (path: string) => pathname.startsWith(path)
  const isMoreActive =
    moreOpen ||
    toolList.some((tool) => pathname.startsWith(tool.route)) ||
    isActive('/profile') ||
    (Boolean(user) && isActive('/history'))

  return (
    <>
      <nav className="app-tabbar" aria-label="Main navigation">
        <TabLink to="/dashboard" icon={dashboardDestination.icon} label="Home" active={isActive('/dashboard')} />

        {resolving ? (
          <>
            <span className="app-tabbar__item app-tabbar__placeholder" aria-hidden="true" />
            <span className="app-tabbar__item app-tabbar__placeholder" aria-hidden="true" />
          </>
        ) : user ? (
          <>
            <TabLink to="/discovery" icon={discover.icon} label={discover.label} active={isActive('/discovery')} />
            <TabLink
              to="/campaigns"
              icon={applications.icon}
              label={applications.label}
              short="Apps"
              active={isActive('/campaigns')}
            />
          </>
        ) : (
          <>
            <TabLink to="/history" icon={history.icon} label="History" active={isActive('/history')} />
            {/* /discovery needs an account, so guests get a Sign in tab. It
                keeps the bar at five tabs so widths do not jump on sign-in. */}
            <button
              type="button"
              className="app-tabbar__item"
              onClick={() => openAuthDialog({ to: '/discovery', reason: 'discovery' })}
            >
              <LogIn aria-hidden />
              <span>Sign in</span>
            </button>
          </>
        )}

        <TabLink to="/cv-studio" icon={cvStudio.icon} label="CV" active={isActive('/cv-studio')} />

        {/* Tools, Profile, History and the rest live in the More sheet;
            Account and Settings are in the account menu at the top. */}
        <button
          type="button"
          className="app-tabbar__item"
          data-active={isMoreActive}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
        >
          <LayoutGrid aria-hidden />
          <span>More</span>
        </button>
      </nav>

      <ToolGridSheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        showAuthenticatedLinks={Boolean(user)}
        accountName={user ? user.full_name || user.email : undefined}
        onSearch={openCommandPalette}
      />
    </>
  )
}
