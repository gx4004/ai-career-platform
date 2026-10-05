import { useState, useEffect } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { LayoutGrid, LogIn } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useBreakpoint } from '#/hooks/use-breakpoint'
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
  const { user, openAuthDialog } = useSession()
  const bp = useBreakpoint()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  // Close the sheet on navigation (handles keyboard and middle-click).
  useEffect(() => {
    setMoreOpen(false)
  }, [pathname])

  // Only on phones, and not on public routes (landing, standalone login).
  if (bp !== 'mobile' || isPublicRoute(pathname)) return null

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

        {user ? (
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
