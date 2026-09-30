import { useState, useEffect } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { Grid2x2, History, LayoutDashboard, LogIn } from 'lucide-react'
import { useBreakpoint } from '#/hooks/use-breakpoint'
import { ToolGridSheet } from '#/components/mobile/ToolGridSheet'
import { isPublicRoute } from '#/lib/navigation/publicRoutes'
import { toolList } from '#/lib/tools/registry'
import { useSession } from '#/hooks/useSession'
import { getNavDestination } from '#/lib/navigation/navGroups'

// Same icon + label as the sidebar and tools sheet (shared navGroups).
const discover = getNavDestination('/discovery')
const applications = getNavDestination('/campaigns')
const cvStudio = getNavDestination('/cv-studio')

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
    toolsOpen ||
    toolList.some((tool) => pathname.startsWith(tool.route)) ||
    isActive('/profile') ||
    (Boolean(user) && isActive('/history'))

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

        {user ? (
          <>
            <Link
              to="/discovery"
              className={`mobile-tab-item${isActive('/discovery') ? ' is-active' : ''}`}
            >
              <discover.icon size={20} strokeWidth={isActive('/discovery') ? 2.2 : 1.8} />
              <span>{discover.label}</span>
            </Link>
            <Link
              to="/campaigns"
              className={`mobile-tab-item${isActive('/campaigns') ? ' is-active' : ''}`}
            >
              <applications.icon size={20} strokeWidth={isActive('/campaigns') ? 2.2 : 1.8} />
              <span>{applications.label}</span>
            </Link>
          </>
        ) : (
          <>
            <Link
              to="/history"
              className={`mobile-tab-item${isActive('/history') ? ' is-active' : ''}`}
            >
              <History size={20} strokeWidth={isActive('/history') ? 2.2 : 1.8} />
              <span>History</span>
            </Link>
            {/* /discovery needs an account, so guests get a Sign in tab. It
                keeps the bar at five tabs so widths do not jump on sign-in. */}
            <button
              type="button"
              className="mobile-tab-item"
              onClick={() => openAuthDialog({ to: '/discovery', reason: 'discovery' })}
            >
              <LogIn size={20} strokeWidth={1.8} />
              <span>Sign in</span>
            </button>
          </>
        )}

        <Link
          to="/cv-studio"
          className={`mobile-tab-item${isActive('/cv-studio') ? ' is-active' : ''}`}
        >
          <cvStudio.icon size={20} strokeWidth={isActive('/cv-studio') ? 2.2 : 1.8} />
          <span>CV</span>
        </Link>

        {/* Tools, Profile, History and the rest live in the "More" sheet;
            Account and Settings are in the session menu at the top. */}
        <button
          type="button"
          className={`mobile-tab-item${isToolsActive ? ' is-active' : ''}`}
          onClick={() => setToolsOpen(!toolsOpen)}
        >
          <Grid2x2 size={20} strokeWidth={isToolsActive ? 2.2 : 1.8} />
          <span>More</span>
        </button>
      </nav>

      <ToolGridSheet
        open={toolsOpen}
        onOpenChange={setToolsOpen}
        showAuthenticatedLinks={Boolean(user)}
      />
    </>
  )
}
