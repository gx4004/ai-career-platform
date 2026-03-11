import { Link, useRouterState } from '@tanstack/react-router'
import { History, LayoutDashboard, Settings, UserRound } from 'lucide-react'

const SHOW_ON = ['/dashboard', '/history', '/account', '/settings']

export function MobileNav() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  if (!SHOW_ON.some((route) => pathname.startsWith(route))) {
    return null
  }

  return (
    <nav className="mobile-nav-pill">
      {[
        { label: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' },
        { label: 'History', icon: History, to: '/history' },
        { label: 'Settings', icon: Settings, to: '/settings' },
        { label: 'Account', icon: UserRound, to: '/account' },
      ].map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className={`mobile-nav-item${pathname.startsWith(item.to) ? ' is-active' : ''}`}
        >
          <item.icon size={18} />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  )
}
