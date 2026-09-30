import { useState, useEffect } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { Grid2x2, History, LayoutDashboard, LogIn, UserRound } from 'lucide-react'
import { useBreakpoint } from '#/hooks/use-breakpoint'
import { ToolGridSheet } from '#/components/mobile/ToolGridSheet'
import { isPublicRoute } from '#/lib/navigation/publicRoutes'
import { toolList } from '#/lib/tools/registry'
import { useSession } from '#/hooks/useSession'
import { getNavDestination } from '#/lib/navigation/navGroups'

// Same icon + label as the sidebar and tools sheet (shared navGroups).
const discover = getNavDestination('/discovery')

export function MobileNav() {
  const [toolsOpen, setToolsOpen] = useState(false)
  const { user, openAuthDialog } = useSession()
  const bp = useBreakpoint()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  // Close tools menu on navigation (handles keyboard/middle-click)
  useEffect(() => {
    setToolsOpen(false)
  }, [pathname])

  // Only show on mobile, hide on public routes (landing, login standalone)
  if (bp !== 'mobile' || isPublicRoute(pathname)) return null

  const isActive = (path: string) => pathname.startsWith(path)
  const isToolsActive =
    toolsOpen || toolList.some((tool) => pathname.startsWith(tool.route))

  return (
    <>
      <nav className="mobile-tab-bar" aria-label="Main navigation">
        <Link
          to="/dashboard"
          className={`mobile-tab-item${isActive('/dashboard') ? ' is-active' : ''}`}
        >
          <LayoutDashboard size={20} strokeWidth={isActive('/dashboard') ? 2.2 : 1.8} />
          <span>Home</span>
        </Link>

        <button
          type="button"
          className={`mobile-tab-item${isToolsActive ? ' is-active' : ''}`}
          onClick={() => setToolsOpen(!toolsOpen)}
        >
          <Grid2x2 size={20} strokeWidth={isToolsActive ? 2.2 : 1.8} />
          <span>Tools</span>
        </button>

        <Link
          to="/history"
          className={`mobile-tab-item${isActive('/history') ? ' is-active' : ''}`}
        >
          <History size={20} strokeWidth={isActive('/history') ? 2.2 : 1.8} />
          <span>History</span>
        </Link>

        {user ? (
          <Link
            to="/discovery"
            className={`mobile-tab-item${isActive('/discovery') ? ' is-active' : ''}`}
          >
            <discover.icon size={20} strokeWidth={isActive('/discovery') ? 2.2 : 1.8} />
            <span>{discover.label}</span>
          </Link>
        ) : (
          // /discovery needs an account, so guests get a Sign in tab in the same
          // slot. It keeps the bar at five tabs so widths do not jump on sign-in.
          <button
            type="button"
            className="mobile-tab-item"
            onClick={() => openAuthDialog({ to: '/discovery', reason: 'discovery' })}
          >
            <LogIn size={20} strokeWidth={1.8} />
            <span>Sign in</span>
          </button>
        )}

        {/* Points at /account, not /profile — "Account" avoids colliding with
            the "You → Profile" nav destination (career facts, /profile). */}
        <Link
          to="/account"
          className={`mobile-tab-item${isActive('/account') || isActive('/settings') ? ' is-active' : ''}`}
        >
          <UserRound size={20} strokeWidth={isActive('/account') || isActive('/settings') ? 2.2 : 1.8} />
          <span>Account</span>
        </Link>
      </nav>

      <ToolGridSheet
        open={toolsOpen}
        onOpenChange={setToolsOpen}
        showAuthenticatedLinks={Boolean(user)}
      />
    </>
  )
}
