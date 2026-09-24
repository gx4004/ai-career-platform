import type { CSSProperties, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { FadeIn, FadeUp } from '#/components/ui/motion'
import { PageFrame } from '#/components/app/PageFrame'
import { cn } from '#/lib/utils'

/**
 * Shared shell for the workspace pages (CV Studio, Evidence, Campaigns,
 * Discovery, Queue). It carries the same visual language as the tool input
 * heroes — ice wash, grain, soft glow, rising text — so newer pages feel like
 * the original product instead of an admin console.
 */
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

export type WorkspaceStat = { label: string; value: ReactNode; hint?: string }

export function WorkspaceHero({
  icon: Icon,
  eyebrow,
  title,
  subtitle,
  actions,
  stats,
  children,
  accent,
}: {
  icon?: LucideIcon
  eyebrow?: string
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  stats?: WorkspaceStat[]
  children?: ReactNode
  accent?: string
}) {
  return (
    <FadeIn>
      <header
        className="workspace-hero"
        style={accent ? ({ '--ws-accent': accent } as CSSProperties) : undefined}
      >
        <div className="workspace-hero__main">
          {Icon ? (
            <span className="workspace-hero__icon" aria-hidden="true">
              <Icon size={26} strokeWidth={1.8} />
            </span>
          ) : null}
          <div className="workspace-hero__text">
            {eyebrow ? <p className="workspace-hero__eyebrow">{eyebrow}</p> : null}
            <h1 className="workspace-hero__title">{title}</h1>
            {subtitle ? <p className="workspace-hero__subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="workspace-hero__actions">{actions}</div> : null}
        </div>
        {stats && stats.length > 0 ? (
          <dl className="workspace-hero__stats">
            {stats.map((stat) => (
              <div key={stat.label} className="workspace-hero__stat">
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
                {stat.hint ? <span className="workspace-hero__stat-hint">{stat.hint}</span> : null}
              </div>
            ))}
          </dl>
        ) : null}
        {children}
      </header>
    </FadeIn>
  )
}

export function WorkspacePanel({
  kicker,
  title,
  description,
  actions,
  children,
  className,
  delay = 0.06,
  id,
  as: Tag = 'section',
}: {
  kicker?: string
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  delay?: number
  id?: string
  as?: 'section' | 'aside' | 'div'
}) {
  const hasHeader = kicker || title || description || actions
  return (
    <FadeUp delay={delay}>
      <Tag id={id} className={cn('section-card workspace-panel', className)}>
        {hasHeader ? (
          <div className="workspace-panel__head">
            <div className="workspace-panel__heading">
              {kicker ? <span className="workspace-panel__kicker">{kicker}</span> : null}
              {title ? <h2 className="workspace-panel__title">{title}</h2> : null}
              {description ? <p className="workspace-panel__description">{description}</p> : null}
            </div>
            {actions ? <div className="workspace-panel__actions">{actions}</div> : null}
          </div>
        ) : null}
        <div className="workspace-panel__body">{children}</div>
      </Tag>
    </FadeUp>
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

export function StatusPill({
  tone = 'neutral',
  children,
}: {
  tone?: 'positive' | 'warning' | 'danger' | 'neutral' | 'accent'
  children: ReactNode
}) {
  return <span className={cn('status-pill', `status-pill--${tone}`)}>{children}</span>
}
