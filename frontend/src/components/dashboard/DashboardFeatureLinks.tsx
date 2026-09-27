import type { ComponentType } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Compass, Megaphone, PanelsTopLeft } from 'lucide-react'
import { useSession } from '#/hooks/useSession'

type FeatureLink = {
  key: string
  label: string
  copy: string
  route: string
  icon: ComponentType<{ size: number }>
}

/**
 * Compact discoverability row for the build-ahead outcomes (CV Studio,
 * Discovery, Campaigns) that otherwise only surface in the sidebar.
 * Discover/Your applications stay hidden for guests since both routes redirect to login
 * (see src/routes/discovery.tsx, src/routes/campaigns.index.tsx).
 */
export function DashboardFeatureLinks() {
  const { status } = useSession()
  const isAuthenticated = status === 'authenticated'

  const links: FeatureLink[] = [
    {
      key: 'cv-studio',
      label: 'CV Studio',
      copy: 'Build and tailor CV versions from your evidence.',
      route: '/cv-studio',
      icon: PanelsTopLeft,
    },
  ]
  if (isAuthenticated) {
    links.push({
      key: 'discovery',
      label: 'Discover jobs',
      copy: 'Browse live roles ranked against your profile.',
      route: '/discovery',
      icon: Compass,
    }, {
      key: 'campaigns',
      label: 'Your applications',
      copy: 'Track every application you have saved.',
      route: '/campaigns',
      icon: Megaphone,
    })
  }

  return (
    <section className="dash-card dash-card--features">
      <div className="grid gap-3">
        <div className="grid gap-0.5">
          <p className="eyebrow">More in your workspace</p>
          <h2 className="section-title">Pick up the next step</h2>
        </div>
        <div className="dashboard-feature-grid">
          {links.map(({ key, label, copy, route, icon: Icon }) => (
            <Link key={key} to={route} className="dashboard-feature-card">
              <span className="dashboard-feature-card-icon">
                <Icon size={20} />
              </span>
              <span className="dashboard-feature-card-body">
                <span className="dashboard-feature-card-title">{label}</span>
                <span className="dashboard-feature-card-copy">{copy}</span>
              </span>
              <ArrowRight size={16} className="dashboard-feature-card-arrow" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
