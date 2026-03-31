import { useLayoutEffect, useRef } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '#/components/ui/breadcrumb'
import { LayoutDashboard } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
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

  useLayoutEffect(() => {
    const updateTopbarHeight = () => {
      const nextHeight = headerRef.current?.offsetHeight ?? 0
      document.documentElement.style.setProperty('--app-topbar-height', `${nextHeight}px`)
    }

    updateTopbarHeight()
    window.addEventListener('resize', updateTopbarHeight)

    return () => {
      window.removeEventListener('resize', updateTopbarHeight)
      document.documentElement.style.removeProperty('--app-topbar-height')
    }
  }, [pathname])

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
            ) : (
              <Breadcrumb className="topbar-compact-breadcrumb">
                <BreadcrumbList className="topbar-compact-breadcrumb-list">
                {meta.breadcrumbs.map((crumb, index) => {
                  const isLast = index === meta.breadcrumbs.length - 1
                  const isDashboardCrumb = index === 0

                  return (
                    <div key={`${crumb}-${index}`} className="topbar-compact-breadcrumb-group">
                      <BreadcrumbItem className="topbar-compact-breadcrumb-item">
                        {isDashboardCrumb ? (
                          <BreadcrumbLink asChild>
                            <Link to="/dashboard">{crumb}</Link>
                          </BreadcrumbLink>
                        ) : isLast ? (
                          <span
                            aria-current="page"
                            className="topbar-compact-current-crumb"
                          >
                            {crumb}
                          </span>
                        ) : (
                          <span className="topbar-compact-static-crumb">{crumb}</span>
                        )}
                      </BreadcrumbItem>
                      {!isLast ? (
                        <BreadcrumbSeparator className="topbar-compact-breadcrumb-separator" />
                      ) : null}
                    </div>
                  )
                })}
                </BreadcrumbList>
              </Breadcrumb>
            )
          ) : isDashboard ? null : (
            <div className="topbar-meta">
              <Badge variant="outline">{meta.sectionLabel}</Badge>
              <Breadcrumb>
                <BreadcrumbList>
                  {meta.breadcrumbs.map((crumb, index) => {
                    const isLast = index === meta.breadcrumbs.length - 1
                    return (
                      <div key={crumb} className="flex items-center gap-2">
                        <BreadcrumbItem>
                          {isLast ? (
                            <BreadcrumbPage>{crumb}</BreadcrumbPage>
                          ) : (
                            <BreadcrumbLink asChild>
                              <Link to={index === 0 ? '/dashboard' : pathname}>{crumb}</Link>
                            </BreadcrumbLink>
                          )}
                        </BreadcrumbItem>
                        {!isLast ? <BreadcrumbSeparator /> : null}
                      </div>
                    )
                  })}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          )}
          {isCompact || isMobile ? null : <h1 className="topbar-page-title">{meta.title}</h1>}
          {isCompact || isMobile ? null : <p className="topbar-page-description">{meta.description}</p>}
        </div>
        <div className="topbar-actions">
          <SessionMenu />
        </div>
      </div>
    </header>
  )
}
