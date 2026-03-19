import { type CSSProperties, useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import { ArrowRight } from 'lucide-react'

export function DashboardToolCard({
  label,
  summary,
  route,
  icon: Icon,
  accent,
  iconUrl,
}: {
  label: string
  summary: string
  route: string
  icon: LucideIcon
  accent: string
  iconUrl?: string
}) {
  const [imgOk, setImgOk] = useState(true)

  return (
    <Link
      to={route}
      className="dashboard-tool-card"
      style={{ '--tool-accent': accent } as CSSProperties}
    >
      <div className="dashboard-tool-card-left">
        <div className="dashboard-tool-card-icon">
          <Icon size={20} />
        </div>
        <div className="dashboard-tool-card-copy">
          <span className="dashboard-tool-card-name">{label}</span>
          <span className="dashboard-tool-card-summary">{summary}</span>
        </div>
      </div>
      <div className="dashboard-tool-card-right">
        {iconUrl && imgOk && (
          <img
            src={iconUrl}
            alt=""
            className="dashboard-tool-card-thumbnail"
            loading="lazy"
            onError={() => setImgOk(false)}
          />
        )}
        <ArrowRight size={16} className="dashboard-tool-card-arrow" />
      </div>
    </Link>
  )
}
