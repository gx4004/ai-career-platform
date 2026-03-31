import { useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { Grid2x2, History, LayoutDashboard, UserRound } from 'lucide-react'
import { useBreakpoint } from '#/hooks/use-breakpoint'
import { ToolGridSheet } from '#/components/mobile/ToolGridSheet'
import { isPublicRoute } from '#/lib/navigation/publicRoutes'

export function MobileNav() {
  const [toolsOpen, setToolsOpen] = useState(false)
  const bp = useBreakpoint()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  // Only show on mobile, hide on public routes (landing, login standalone)
  if (bp !== 'mobile' || isPublicRoute(pathname)) return null

  const isActive = (path: string) => pathname.startsWith(path)
  const isToolsActive =
    toolsOpen ||
    ['/resume', '/job-match', '/cover-letter', '/interview', '/career', '/portfolio'].some((r) =>
      pathname.startsWith(r),
    )

  return (
    <>
      <nav className="mobile-tab-bar" aria-label="Main navigation">
        <Link
          to="/dashboard"
          className={`mobile-tab-item${isActive('/dashboard') ? ' is-active' : ''}`}
          onClick={() => setToolsOpen(false)}
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
          onClick={() => setToolsOpen(false)}
        >
          <History size={20} strokeWidth={isActive('/history') ? 2.2 : 1.8} />
          <span>History</span>
        </Link>

        <Link
          to="/account"
          className={`mobile-tab-item${isActive('/account') || isActive('/settings') ? ' is-active' : ''}`}
          onClick={() => setToolsOpen(false)}
        >
          <UserRound size={20} strokeWidth={isActive('/account') || isActive('/settings') ? 2.2 : 1.8} />
          <span>Profile</span>
        </Link>
      </nav>

      <ToolGridSheet open={toolsOpen} onOpenChange={setToolsOpen} />
    </>
  )
}
