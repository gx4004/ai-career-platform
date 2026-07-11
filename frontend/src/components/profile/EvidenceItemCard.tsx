import { Check, Pencil, Trash2, X } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'
import type { EvidenceItem } from '#/lib/api/schemas'
import {
  PROVENANCE_DESCRIPTIONS,
  PROVENANCE_LABELS,
  STATE_LABELS,
  contentEntries,
} from '#/lib/profile/evidence'

export function EvidenceItemCard({
  item,
  busy,
  onConfirm,
  onReject,
  onCorrect,
  onDelete,
}: {
  item: EvidenceItem
  busy: boolean
  onConfirm: (item: EvidenceItem) => void
  onReject: (item: EvidenceItem) => void
  onCorrect: (item: EvidenceItem) => void
  onDelete: (item: EvidenceItem) => void
}) {
  const entries = contentEntries(item.content)
  const state = item.confirmation_state

  return (
    <li
      className={cn('evidence-card', `evidence-card--${state}`)}
      data-state={state}
      data-provenance={item.provenance}
    >
      <div className="evidence-card__meta">
        <Badge
          variant="outline"
          className={cn('evidence-state', `evidence-state--${state}`)}
        >
          {STATE_LABELS[state]}
        </Badge>
        <Badge variant="ghost" title={PROVENANCE_DESCRIPTIONS[item.provenance]}>
          {PROVENANCE_LABELS[item.provenance]}
        </Badge>
      </div>

      <dl className="evidence-card__content">
        {entries.length > 0 ? (
          entries.map(({ key, value }) => (
            <div className="evidence-field" key={key}>
              <dt className="evidence-field__key">{key}</dt>
              <dd className="evidence-field__value">{value || '—'}</dd>
            </div>
          ))
        ) : (
          <p className="small-copy muted-copy">No content recorded.</p>
        )}
      </dl>

      <div className="evidence-card__actions">
        {state !== 'confirmed' ? (
          <Button
            size="sm"
            variant="outline"
            className="evidence-action evidence-action--confirm"
            disabled={busy}
            onClick={() => onConfirm(item)}
          >
            <Check size={14} />
            {state === 'rejected' ? 'Restore & confirm' : 'Confirm'}
          </Button>
        ) : null}
        {state !== 'rejected' ? (
          <Button
            size="sm"
            variant="ghost"
            className="evidence-action"
            disabled={busy}
            onClick={() => onReject(item)}
          >
            <X size={14} />
            Reject
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="evidence-action"
          disabled={busy}
          onClick={() => onCorrect(item)}
        >
          <Pencil size={14} />
          Correct
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="evidence-action evidence-action--danger"
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
