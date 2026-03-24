import { type CSSProperties } from 'react'
import { Link } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'

export function DashboardShowcaseCard({
  label,
  summary,
  route,
  icon: Icon,
  accent,
  thumbSrc,
}: {
  label: string
  summary: string
  route: string
  icon: LucideIcon
  accent: string
  thumbSrc: string
}) {
  return (
    <Link
      to={route}
      className="dash-card dash-showcase-card"
      style={{ '--tool-accent': accent } as CSSProperties}
    >
      <div className="dash-showcase-thumb">
        <img src={thumbSrc} alt="" loading="lazy" />
      </div>
      <div className="dash-showcase-body">
        <div className="dash-showcase-header">
          <div className="dash-showcase-icon">
            <Icon size={18} />
          </div>
          <span className="dash-showcase-name">{label}</span>
        </div>
        <span className="dash-showcase-summary">{summary}</span>
      </div>
    </Link>
  )
}
