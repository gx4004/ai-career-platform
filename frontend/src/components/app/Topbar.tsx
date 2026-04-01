import { useLayoutEffect, useRef } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { LayoutDashboard, History, UserRound, Settings } from 'lucide-react'
import { SessionMenu } from '#/components/auth/SessionMenu'
import { SidebarTrigger } from '#/components/ui/sidebar'
import { AppBrandLockup } from '#/components/app/AppBrandLockup'
import { getRouteMeta } from '#/lib/navigation/routeMeta'
import { toolList } from '#/lib/tools/registry'
import { useBreakpoint } from '#/hooks/use-breakpoint'
import { cn } from '#/lib/utils'

export function Topbar() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const meta = getRouteMeta(pathname)
  const bp = useBreakpoint()
  const isMobile = bp === 'mobile'
  const isCompact = meta.topbarVariant === 'compact'
  const isDashboard = pathname === '/dashboard'
  const entryTool = toolList.find((tool) => pathname === tool.route)
  const headerRef = useRef<HTMLElement | null>(null)

  // Page icon/label for non-tool compact pages (pill style, same as tool pages)
  const pageIcons: Record<string, { icon: typeof LayoutDashboard; label: string }> = {
    '/history': { icon: History, label: 'History' },
    '/account': { icon: UserRound, label: 'Account' },
    '/settings': { icon: Settings, label: 'Settings' },
  }
  const pagePill = pageIcons[pathname]

  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return

    const update = () => {
      document.documentElement.style.setProperty('--app-topbar-height', `${el.offsetHeight}px`)
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  // Mobile: simple brand + page name + session menu
  const mobilePageName = isDashboard
    ? 'Your Workspace'
    : entryTool
      ? entryTool.label
      : meta.breadcrumbs[meta.breadcrumbs.length - 1] || meta.title

  return (
    <header
      ref={headerRef}
      className={cn(
        'topbar',
        (isCompact || isMobile) && 'topbar--compact',
      )}
    >
      <div
        className={cn(
          'topbar-inner',
          (isCompact || isMobile) && 'topbar-inner--compact',
        )}
      >
        {isMobile ? (
          <Link to="/dashboard" className="topbar-mobile-brand">
            <AppBrandLockup mode="compact" />
          </Link>
        ) : (
          <SidebarTrigger className="mr-2 button-toolbar-utility md:hidden" />
        )}
        <div className={cn('topbar-breadcrumb', isCompact && 'topbar-breadcrumb--compact', isMobile && 'topbar-breadcrumb--mobile')}>
          {isMobile ? (
            <span className="topbar-mobile-title">{mobilePageName}</span>
          ) : isCompact ? (
            isDashboard ? (
              <div className="topbar-tool-entry-chip" aria-current="page">
                <span className="topbar-tool-pill">
                  <LayoutDashboard size={16} />
                  <span className="topbar-tool-pill-text">Your Workspace</span>
                </span>
              </div>
            ) : entryTool ? (
              <div className="topbar-tool-entry-chip" aria-current="page">
                <span className="topbar-tool-pill">
                  <entryTool.icon size={16} />
                  <span className="topbar-tool-pill-text">{entryTool.label}</span>
                </span>
              </div>
            ) : pagePill ? (
              <div className="topbar-tool-entry-chip" aria-current="page">
                <span className="topbar-tool-pill">
                  <pagePill.icon size={16} />
                  <span className="topbar-tool-pill-text">{pagePill.label}</span>
                </span>
              </div>
            ) : (
              <div className="topbar-tool-entry-chip" aria-current="page">
                <span className="topbar-tool-pill">
                  <span className="topbar-tool-pill-text">{meta.title}</span>
                </span>
              </div>
            )
          ) : null}
        </div>
        <div className="topbar-actions">
          <SessionMenu />
        </div>
      </div>
    </header>
  )
}
