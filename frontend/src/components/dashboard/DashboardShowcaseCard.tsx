import { type CSSProperties } from 'react'
import { Link } from '@tanstack/react-router'

export function DashboardShowcaseCard({
  label,
  summary,
  route,
  accent,
  iconSrc,
}: {
  label: string
  summary: string
  route: string
  accent: string
  iconSrc: string
}) {
  return (
    <Link
      to={route}
      className="dash-card dash-showcase-card"
      style={{ '--tool-accent': accent } as CSSProperties}
    >
      <div className="dash-showcase-body">
        <div className="dash-showcase-header">
          <div className="dash-showcase-icon">
            <img
              src={iconSrc}
              alt=""
              aria-hidden="true"
              className="dash-showcase-icon-img"
              width={400}
              height={400}
              loading="lazy"
              decoding="async"
            />
          </div>
          <span className="dash-showcase-name">{label}</span>
        </div>
        <span className="dash-showcase-summary">{summary}</span>
      </div>
    </Link>
  )
}
