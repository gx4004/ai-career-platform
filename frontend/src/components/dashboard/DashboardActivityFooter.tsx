import { Link } from '@tanstack/react-router'
import { LogIn } from 'lucide-react'

export function DashboardActivityFooter() {
  return (
    <div className="dashboard-unauth-hint">
      <LogIn size={14} className="dashboard-unauth-hint-icon" aria-hidden="true" />
      <span>
        <Link to="/login" className="dashboard-unauth-hint-link">Sign in</Link>
        {' '}to see your recent runs and saved results
      </span>
    </div>
  )
}
