import { Link, useRouterState } from '@tanstack/react-router'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '#/components/ui/breadcrumb'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { ThemeToggle } from '#/components/app/ThemeToggle'
import { SessionMenu } from '#/components/auth/SessionMenu'
import { SidebarTrigger } from '#/components/ui/sidebar'
import { getRouteMeta } from '#/lib/navigation/routeMeta'

export function Topbar() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const meta = getRouteMeta(pathname)

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <SidebarTrigger className="mr-2 button-toolbar-utility md:hidden" />
        <div className="topbar-breadcrumb">
          <div className="flex flex-wrap items-center gap-3">
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
          <h1 className="topbar-page-title">{meta.title}</h1>
          <p className="topbar-page-description">{meta.description}</p>
        </div>
        <div className="topbar-actions">
          {pathname === '/dashboard' ? (
            <Button asChild className="button-hero-primary">
              <Link to="/resume">Start with resume →</Link>
            </Button>
          ) : null}
          <ThemeToggle />
          <SessionMenu />
        </div>
      </div>
    </header>
  )
}
