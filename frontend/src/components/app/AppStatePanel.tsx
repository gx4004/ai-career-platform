import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Button, ErrorState, Page } from '#/components/kit'
import type { IllustrationScene } from '#/components/illustrations/SceneVisual'

type PanelAction = {
  label: string
  to?: string
  onClick?: () => void
  variant?: 'default' | 'outline' | 'ghost'
}

const VARIANTS = { default: 'primary', outline: 'secondary', ghost: 'ghost' } as const

/**
 * A plain state page for screens that have not moved to the kit's EmptyState and ErrorState yet: one title,
 * one line of explanation, a primary and a secondary action, left-aligned. `icon`, `scene` and `visual` are
 * accepted for existing callers but no longer rendered.
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
  const buttons = actions.map((action, i) => {
    const variant = VARIANTS[action.variant ?? (i === 0 ? 'default' : 'outline')]
    return action.to ? (
      <Button key={action.label} asChild variant={variant}>
        <Link to={action.to}>{action.label}</Link>
      </Button>
    ) : (
      <Button key={action.label} type="button" variant={variant} onClick={action.onClick}>
        {action.label}
      </Button>
    )
  })

  return (
    <Page as="div">
      <ErrorState
        size="page"
        role="status"
        headingLevel={1}
        code={badge}
        title={title}
        description={description}
        detail={detail}
        backAction={buttons.length > 0 ? <>{buttons}</> : undefined}
      />
      {children}
    </Page>
  )
}
