import { useId } from 'react'
import {
  BadgeCheck,
  CalendarClock,
  Pencil,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'
import type {
  DevelopmentItem,
  DevelopmentState,
} from '#/lib/api/developmentSchemas'
import {
  GAP_KIND_LABELS,
  STATE_LABELS,
  STATE_ORDER,
  formatTargetDate,
} from '#/lib/development/plan'

export function DevelopmentItemCard({
  item,
  busy,
  onStateChange,
  onEdit,
  onDelete,
  onConfirmEvidence,
  onDeclineEvidence,
}: {
  item: DevelopmentItem
  busy: boolean
  onStateChange: (item: DevelopmentItem, state: DevelopmentState) => void
  onEdit: (item: DevelopmentItem) => void
  onDelete: (item: DevelopmentItem) => void
  onConfirmEvidence: (item: DevelopmentItem) => void
  onDeclineEvidence: (item: DevelopmentItem) => void
}) {
  const stateSelectId = useId()
  const state = item.state
  const targetDate = formatTargetDate(item.target_date)

  return (
    <li
      className={cn('development-card', `development-card--${state}`)}
      data-state={state}
      aria-busy={busy || undefined}
    >
      <div className="development-card__meta">
        {/* aria-live so a state change is announced once the badge text updates. */}
        <span aria-live="polite" className="development-card__state-live">
          <Badge
            variant="outline"
            className={cn('development-state', `development-state--${state}`)}
          >
            {STATE_LABELS[state]}
          </Badge>
        </span>
        <Badge variant="ghost" title={`Derived from a ${GAP_KIND_LABELS[item.gap_kind].toLowerCase()} gap`}>
          {GAP_KIND_LABELS[item.gap_kind]}
        </Badge>
      </div>

      <dl className="development-card__facts">
        <div className="development-fact">
          <dt className="development-fact__key">
            <CalendarClock size={13} aria-hidden="true" />
            Target date
          </dt>
          <dd className="development-fact__value">
            {targetDate ?? <span className="muted-copy">No target date</span>}
          </dd>
        </div>
        <div className="development-fact">
          <dt className="development-fact__key">
            <StickyNote size={13} aria-hidden="true" />
            Notes
          </dt>
          <dd className="development-fact__value">
            {item.notes ? item.notes : <span className="muted-copy">No notes yet</span>}
          </dd>
        </div>
      </dl>

      {item.evidence_confirmation_state === 'unconfirmed' ? (
        <section
          className="development-card__evidence"
          aria-label="Evidence proposal"
        >
          <div className="development-card__evidence-copy">
            <BadgeCheck size={16} aria-hidden="true" />
            <div>
              <strong>Ready to become reusable evidence</strong>
              <p>
                Confirm this proposal to use it in future CV tailoring and job
                recommendations, or decline it without changing the completed item.
              </p>
            </div>
          </div>
          <div className="development-card__evidence-actions">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => onConfirmEvidence(item)}
            >
              <BadgeCheck size={14} />
              Confirm evidence
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => onDeclineEvidence(item)}
            >
              <X size={14} />
              Decline proposal
            </Button>
          </div>
        </section>
      ) : item.evidence_confirmation_state === 'confirmed' ? (
        <p className="development-card__evidence-confirmed" role="status">
          <BadgeCheck size={15} aria-hidden="true" />
          Evidence confirmed
        </p>
      ) : null}

      <div className="development-card__control">
        <label className="development-card__control-label" htmlFor={stateSelectId}>
          Status
        </label>
        <select
          id={stateSelectId}
          className="development-select"
          value={state}
          disabled={busy}
          onChange={(event) =>
            onStateChange(item, event.target.value as DevelopmentState)
          }
        >
          {STATE_ORDER.map((option) => (
            <option key={option} value={option}>
              {STATE_LABELS[option]}
            </option>
          ))}
        </select>
      </div>

      <div className="development-card__actions">
        <Button
          size="sm"
          variant="ghost"
          className="development-action"
          disabled={busy}
          onClick={() => onEdit(item)}
        >
          <Pencil size={14} />
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="development-action development-action--danger"
          disabled={busy}
          onClick={() => onDelete(item)}
        >
          <Trash2 size={14} />
          Delete
        </Button>
      </div>
    </li>
  )
}
