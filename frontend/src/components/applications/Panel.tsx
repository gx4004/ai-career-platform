import type { ReactNode } from 'react'
import { cn } from '#/lib/utils'

/**
 * A plain section: heading row (title left, small actions right), optional
 * one-line description, then the body. Separated from its neighbours by a
 * hairline and spacing, not a card.
 */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  const hasHeader = title || actions
  return (
    <section className={cn('camp-panel', className)}>
      {hasHeader ? (
        <div className="camp-panel__head">
          {title ? <h2 className="camp-panel__title">{title}</h2> : <span />}
          {actions ? <div className="camp-panel__actions">{actions}</div> : null}
        </div>
      ) : null}
      {description ? <p className="camp-panel__description">{description}</p> : null}
      <div className="camp-panel__body">{children}</div>
    </section>
  )
}

/** Small text badge. Colour only when it carries meaning. */
export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'positive' | 'warning' | 'danger' | 'neutral' | 'accent'
  children: ReactNode
}) {
  return <span className={cn('camp-badge', `camp-badge--${tone}`)}>{children}</span>
}

/** One short line, optionally with one action. No illustration. */
export function EmptyLine({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="camp-empty">
      <p>{children}</p>
      {action}
    </div>
  )
}
