import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function FloatingToolNav({
  label,
  icon: Icon,
  accent,
  actions,
}: {
  label: string
  icon: LucideIcon
  accent?: string
  actions?: ReactNode
}) {
  return (
    <nav className="tool-floating-nav">
      <div className="tool-floating-nav-left">
        <div className="tool-floating-label">
          <Icon size={16} style={{ color: accent }} />
          <span>{label}</span>
        </div>
      </div>
      {actions && <div className="tool-floating-nav-actions">{actions}</div>}
    </nav>
  )
}
