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
  id,
  moment,
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
  /** Anchor for deep links ("show me the new fact"): the row can be scrolled to and focused. */
  id?: string
  /** arrived: the row has just landed in this list (saved, added); found: a link pointed here. Both are short and quiet. */
  moment?: 'arrived' | 'found'
  primary?: ReactNode
  reveal?: ReactNode
  /** Sits between the text and the actions (a skill's status). */
  children?: ReactNode
}) {
  return (
    <Row id={id} tabIndex={id ? -1 : undefined} aria-busy={busy || undefined} data-moment={moment}>
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
