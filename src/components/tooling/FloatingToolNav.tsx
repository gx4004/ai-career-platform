import { ArrowLeft } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'

export function FloatingToolNav({
  label,
  icon: Icon,
  accent,
  backTo = '/dashboard',
  actions,
}: {
  label: string
  icon: LucideIcon
  accent?: string
  backTo?: string
  actions?: React.ReactNode
}) {
  return (
    <nav className="tool-floating-nav">
      <div className="tool-floating-nav-left">
        <Link to={backTo} className="tool-floating-back">
          <ArrowLeft size={18} />
        </Link>
        <div className="tool-floating-label">
          <Icon size={16} style={{ color: accent }} />
          <span>{label}</span>
        </div>
      </div>
      {actions && <div className="tool-floating-nav-actions">{actions}</div>}
    </nav>
  )
}
