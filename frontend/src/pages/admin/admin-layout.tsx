import '#/styles/admin.css'
import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { LayoutDashboard, Users, FileText, ArrowLeft } from 'lucide-react'

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/runs', label: 'Runs', icon: FileText },
] as const

export function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <span className="admin-sidebar-brand-label">Admin Panel</span>
        </div>
        <nav className="admin-sidebar-nav">
          {NAV.map((item) => {
            const isActive =
              item.to === '/admin'
                ? pathname === '/admin' || pathname === '/admin/'
                : pathname.startsWith(item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`admin-sidebar-link${isActive ? ' is-active' : ''}`}
              >
                <item.icon size={16} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
        <div className="admin-sidebar-footer">
          <Link to="/dashboard" className="admin-sidebar-link admin-sidebar-link--back">
            <ArrowLeft size={16} />
            <span>Back to App</span>
          </Link>
        </div>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  )
}
