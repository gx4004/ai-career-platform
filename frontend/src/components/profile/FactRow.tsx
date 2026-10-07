import type { ReactNode } from 'react'
import { Pencil } from 'lucide-react'
import { Button, Row, RowActions, RowBody, RowMeta, RowReveal, RowSubtitle, RowTitle } from '#/components/kit'

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
  actionsPlacement = 'inline',
  children,
}: {
  title: ReactNode
  /** Accessible name of the Edit button, e.g. "Edit Python" (verb then object, as on every other row). */
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
  /**
   * inline (default): the actions keep the end of the row. below: on a narrow list (the suggestions rail, a phone)
   * they take a line of their own under the text, so two labelled answers never squeeze the fact to a few words.
   */
  actionsPlacement?: 'inline' | 'below'
  /**
   * A status beside the text (the "Saved" badge of a fact that has just arrived). It is the row's kit meta: beside
   * the actions on a wide list, on its own line under the text on a narrow one, so it never pushes the title aside.
   */
  children?: ReactNode
}) {
  return (
    <Row id={id} className="profile-fact" tabIndex={id ? -1 : undefined} aria-busy={busy || undefined} data-moment={moment}>
      <RowBody>
        <RowTitle>{title}</RowTitle>
        {details ? <RowSubtitle>{details}</RowSubtitle> : null}
      </RowBody>
      {children ? <RowMeta placement="below">{children}</RowMeta> : null}
      <RowActions reveal={false} placement={actionsPlacement}>
        {primary}
        <Button iconOnly size="sm" variant="ghost" disabled={busy} aria-label={editLabel} onClick={onEdit}>
          <Pencil aria-hidden="true" />
        </Button>
        {reveal ? <RowReveal>{reveal}</RowReveal> : null}
      </RowActions>
    </Row>
  )
}
