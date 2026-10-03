import type { ReactNode } from 'react'
import { Pencil } from 'lucide-react'
import { Button, Row, RowActions, RowBody, RowReveal, RowSubtitle, RowTitle } from '#/components/kit'

/**
 * The one row for everything on the profile: a saved fact, a suggestion, a skill to build. `details` are the
 * lines under the title (the rest of a fact, a target date, notes). Edit is always there; `primary` holds the
 * row's main answers (Save and Dismiss) before it, and `reveal` its quiet destructive control (delete), which
 * shows on hover and focus and always on touch.
 */
export function FactRow({
  title,
  editLabel,
  onEdit,
  details,
  busy = false,
  primary,
  reveal,
  children,
}: {
  title: ReactNode
  /** Accessible name of the Edit button, e.g. "Edit: Python". */
  editLabel: string
  onEdit: () => void
  details?: ReactNode
  busy?: boolean
  primary?: ReactNode
  reveal?: ReactNode
  /** Sits between the text and the actions (a skill's status). */
  children?: ReactNode
}) {
  return (
    <Row aria-busy={busy || undefined}>
      <RowBody>
        <RowTitle>{title}</RowTitle>
        {details ? <RowSubtitle>{details}</RowSubtitle> : null}
      </RowBody>
      {children}
      <RowActions reveal={false}>
        {primary}
        <Button iconOnly size="sm" variant="ghost" disabled={busy} aria-label={editLabel} onClick={onEdit}>
          <Pencil aria-hidden="true" />
        </Button>
        {reveal ? <RowReveal>{reveal}</RowReveal> : null}
      </RowActions>
    </Row>
  )
}
