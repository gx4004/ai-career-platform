import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { PageFrame } from '#/components/app/PageFrame'
import { cn } from '#/lib/utils'

/** The frame of the workspace pages that have not moved to the kit's Page yet (CV Studio, Profile, Settings, Account). */
export function WorkspacePage({
  children,
  className,
  wide = false,
}: {
  children: ReactNode
  className?: string
  wide?: boolean
}) {
  return (
    <PageFrame className={cn('workspace-page', wide && 'workspace-page--wide', className)}>
      {children}
    </PageFrame>
  )
}

export function WorkspaceEmpty({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="workspace-empty">
      {Icon ? (
        <span className="workspace-empty__icon" aria-hidden="true">
          <Icon size={22} strokeWidth={1.8} />
        </span>
      ) : null}
      <p className="workspace-empty__title">{title}</p>
      {description ? <p className="workspace-empty__description">{description}</p> : null}
      {action ? <div className="workspace-empty__action">{action}</div> : null}
    </div>
  )
}
