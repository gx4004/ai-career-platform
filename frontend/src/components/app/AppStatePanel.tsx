import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Button, ErrorState, Page, ScoreSeal } from '#/components/kit'

type PanelAction = {
  label: string
  to?: string
  onClick?: () => void
  variant?: 'default' | 'outline' | 'ghost'
}

const VARIANTS = { default: 'primary', outline: 'secondary', ghost: 'ghost' } as const

/** What the seal beside the copy says: a short word ("404", "!") and the tone that says how serious it is. */
export type StateSeal = { value: string; label: string; tone?: 'lemon' | 'rose' | 'lilac' | 'stone' }

const DEFAULT_SEAL: StateSeal = { value: '!', label: 'Error', tone: 'rose' }

/**
 * A whole-page state (crash, failed route, update needed): a seal on the left, the ErrorState copy on the
 * right (code, display title, one sentence, the detail in a mono block), then a primary and a secondary
 * action. Stacks on a phone. The 404 page composes the same layout through `StatePage`.
 */
export function AppStatePanel({
  badge,
  title,
  description,
  detail,
  actions = [],
  seal = DEFAULT_SEAL,
  role = 'alert',
  children,
}: {
  badge?: string
  title: string
  description: string
  detail?: string
  actions?: PanelAction[]
  seal?: StateSeal
  /** A failure is announced (alert); the update-needed page is a quiet status. */
  role?: 'alert' | 'status'
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
      <StatePage
        seal={seal}
        role={role}
        code={badge}
        title={title}
        description={description}
        detail={detail}
        actions={buttons.length > 0 ? <>{buttons}</> : undefined}
      />
      {children}
    </Page>
  )
}

/** The seal-and-copy layout shared by the 404 page and the error pages. */
export function StatePage({
  seal,
  role = 'status',
  code,
  title,
  description,
  detail,
  actions,
}: {
  seal: StateSeal
  role?: 'alert' | 'status' | 'none'
  code?: ReactNode
  title: string
  description: string
  detail?: string
  actions?: ReactNode
}) {
  const tone = seal.tone ?? 'rose'
  return (
    <div className="state-page">
      <ScoreSeal value={seal.value} unit={null} label={seal.label} size="md" tone={tone} rotate={-4} />
      <ErrorState
        variant="open"
        role={role}
        headingLevel={1}
        code={code}
        title={title}
        description={description}
        detail={detail}
        backAction={actions}
      />
    </div>
  )
}
