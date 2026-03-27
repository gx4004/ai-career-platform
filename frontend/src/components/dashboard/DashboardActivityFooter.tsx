import { Link } from '@tanstack/react-router'
import { BarChart3, Star, ArrowRight } from 'lucide-react'

export function DashboardActivityFooter() {
  return (
    <div className="dashboard-activity-footer">
      <div className="dashboard-activity-cards">
        <div className="dashboard-stat-card">
          <div className="dashboard-stat-card-icon">
            <BarChart3 size={22} />
          </div>
          <div className="dashboard-stat-card-body">
            <span className="dashboard-stat-card-value">0</span>
            <span className="dashboard-stat-card-label">Total Runs</span>
          </div>
        </div>
        <div className="dashboard-stat-card">
          <div className="dashboard-stat-card-icon">
            <Star size={22} />
          </div>
          <div className="dashboard-stat-card-body">
            <span className="dashboard-stat-card-value">0</span>
            <span className="dashboard-stat-card-label">Favorites</span>
          </div>
        </div>
      </div>
      <div className="dashboard-activity-signin">
        <Link to="/login" className="dashboard-activity-signin-link">
          Sign in to track your runs
          <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  )
}
