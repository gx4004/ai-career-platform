import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '#/components/ui/button'
import { SceneVisual } from '#/components/illustrations/SceneVisual'
import type { IllustrationScene } from '#/components/illustrations/SceneVisual'

type PanelAction = {
  label: string
  to?: string
  onClick?: () => void
  variant?: 'default' | 'outline' | 'ghost'
}

export function AppStatePanel({
  badge,
  title,
  description,
  icon,
  scene,
  visual,
  detail,
  actions = [],
}: {
  badge?: string
  title: string
  description: string
  icon?: ReactNode
  scene?: IllustrationScene
  visual?: ReactNode
  detail?: string
  actions?: PanelAction[]
}) {
  return (
    <section className="page-shell">
      <div className="content-narrow">
        <div className="app-state-panel section-card grid gap-5 p-8 text-center">
          {badge ? <div className="section-kicker mx-auto">{badge}</div> : null}
          {visual ? <div className="mx-auto w-full max-w-sm">{visual}</div> : null}
          {!visual && scene ? (
            <div className="mx-auto w-full max-w-xl">
              <SceneVisual scene={scene} />
            </div>
          ) : null}
          {icon ? <div className="mx-auto">{icon}</div> : null}
          <div className="grid gap-2">
            <h1 className="app-state-panel-title">{title}</h1>
            <p className="muted-copy">{description}</p>
            {detail ? <p className="small-copy muted-copy">{detail}</p> : null}
          </div>
          {actions.length > 0 ? (
            <div className="button-cluster button-cluster--center justify-center">
              {actions.map((action, i) =>
                action.to ? (
                  <Button
                    key={action.label}
                    variant={action.variant || 'default'}
                    className={i === 0 ? 'button-hero-primary' : undefined}
                    asChild
                  >
                    <Link to={action.to}>{action.label}</Link>
                  </Button>
                ) : (
                  <Button
                    key={action.label}
                    variant={action.variant || 'default'}
                    className={i === 0 ? 'button-hero-primary' : undefined}
                    onClick={action.onClick}
                  >
                    {action.label}
                  </Button>
                ),
              )}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
