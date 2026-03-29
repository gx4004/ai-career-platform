import { Outlet, Link, useLocation } from '@tanstack/react-router'
import { LayoutDashboard, Users, FileText, LogOut } from 'lucide-react'
import { clearToken } from '#/lib/api'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/runs', label: 'Runs', icon: FileText },
]

export function AdminShell() {
  const location = useLocation()

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">Admin Panel</div>
        <nav className="admin-sidebar-nav">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`admin-sidebar-link ${location.pathname === item.to ? 'active' : ''}`}
            >
              <item.icon size={16} />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <button
            onClick={() => { clearToken(); window.location.href = '/login' }}
            className="admin-sidebar-link"
            style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  )
}
