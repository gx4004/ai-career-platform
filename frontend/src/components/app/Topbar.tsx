import { useLayoutEffect, useRef } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '#/components/ui/breadcrumb'
import { Badge } from '#/components/ui/badge'
import { SessionMenu } from '#/components/auth/SessionMenu'
import { SidebarTrigger } from '#/components/ui/sidebar'
import { getRouteMeta } from '#/lib/navigation/routeMeta'
import { toolList } from '#/lib/tools/registry'
import { cn } from '#/lib/utils'

export function Topbar() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const meta = getRouteMeta(pathname)
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

  return (
    <header
      ref={headerRef}
      className={cn(
        'topbar',
        isCompact && 'topbar--compact',
      )}
    >
      <div
        className={cn(
          'topbar-inner',
          isCompact && 'topbar-inner--compact',
        )}
      >
        <SidebarTrigger
          className="mr-2 button-toolbar-utility md:hidden"
        />
        <div className={cn('topbar-breadcrumb', isCompact && 'topbar-breadcrumb--compact')}>
          {isCompact ? (
            isDashboard ? (
              <span aria-current="page" className="topbar-compact-current-crumb">
                Dashboard
              </span>
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
          {isCompact ? null : <h1 className="topbar-page-title">{meta.title}</h1>}
          {isCompact ? null : <p className="topbar-page-description">{meta.description}</p>}
        </div>
        <div className="topbar-actions">
          <SessionMenu />
        </div>
      </div>
    </header>
  )
}
