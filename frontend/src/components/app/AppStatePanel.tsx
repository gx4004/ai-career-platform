import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '#/components/ui/button'
import type { IllustrationScene } from '#/components/illustrations/SceneVisual'

type PanelAction = {
  label: string
  to?: string
  onClick?: () => void
  variant?: 'default' | 'outline' | 'ghost'
}

/**
 * A plain state page: one title, one line of explanation, and a primary plus a
 * secondary action, left-aligned. `icon`, `scene` and `visual` are accepted for
 * existing callers but no longer rendered (no illustrations on state pages).
 */
export function AppStatePanel({
  badge,
  title,
  description,
  detail,
  actions = [],
  children,
}: {
  badge?: string
  title: string
  description: string
  icon?: ReactNode
  scene?: IllustrationScene
  visual?: ReactNode
  detail?: string
  actions?: PanelAction[]
  children?: ReactNode
}) {
  return (
    <section className="page-shell">
      <div className="state-page">
        {badge ? <p className="state-page__code">{badge}</p> : null}
        <h1 className="state-page__title">{title}</h1>
        <p className="state-page__text">{description}</p>
        {detail ? <p className="state-page__detail">{detail}</p> : null}
        {actions.length > 0 ? (
          <div className="state-page__actions">
            {actions.map((action, i) => {
              const variant = action.variant || (i === 0 ? 'default' : 'outline')
              return action.to ? (
                <Button key={action.label} variant={variant} size="sm" asChild>
                  <Link to={action.to}>{action.label}</Link>
                </Button>
              ) : (
                <Button key={action.label} variant={variant} size="sm" onClick={action.onClick}>
                  {action.label}
                </Button>
              )
            })}
          </div>
        ) : null}
        {children}
      </div>
    </section>
  )
}
