import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Star } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Skeleton } from '#/components/ui/skeleton'
import type { HistoryToolDisplay } from '#/lib/tools/historyToolLabel'
import { toolAccentStyle } from '#/lib/tools/styleUtils'

/** "Sep 29", or "Sep 29, 2025" when the run is not from the current year. */
export function formatRunDate(value: string | Date, now: Date = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

type RunRowProps = {
  tool: HistoryToolDisplay
  label: string
  /** Pre-formatted short date; omitted where the row shows a star instead. */
  date?: string
  showFavoriteStar?: boolean
  /** Muted supporting line under the label (clamped to two lines). */
  summary?: string | null
  /** Extra small muted lines (workspace, older-run note). */
  notes?: ReactNode
  /** Replaces the label and summary while the row is being edited. */
  editor?: ReactNode
}

/**
 * The shared run row used by the dashboard lists and History.
 *
 * - `linked`: the whole row is one Link with a decorative "Open" (dashboard).
 * - `actions`: a plain row with a real "Open" Link beside a sibling action
 *   cluster (History). A Link may not contain buttons, so the two modes exist.
 */
export function RunRow(
  props: RunRowProps &
    (
      | { mode: 'linked'; href: string }
      | { mode: 'actions'; href: string | null; actions: ReactNode }
    ),
) {
  const { tool, label, date, showFavoriteStar, summary, notes, editor } = props
  const Icon = tool.icon
  const body = (
    <>
      <div className="run-row-icon-col" aria-hidden>
        <Icon size={16} />
      </div>
      <div className="run-row-body">
        <div className="run-row-meta">
          {showFavoriteStar ? <Star size={12} className="run-row-favorite" aria-hidden /> : null}
          <Badge variant="outline">
            <span className="run-row-badge-text">{tool.label}</span>
          </Badge>
          {date ? <span className="small-copy muted-copy run-row-date">{date}</span> : null}
        </div>
        {editor ?? (
          <>
            <span className="run-row-label">{label}</span>
            {summary ? <span className="run-row-summary">{summary}</span> : null}
          </>
        )}
        {notes}
      </div>
    </>
  )

  if (props.mode === 'linked') {
    return (
      <Link
        to={props.href}
        className="run-row run-row--linked"
        style={toolAccentStyle(tool.accent)}
      >
        {body}
        <span className="run-row-cta" aria-hidden>
          <span>Open</span>
          <ArrowRight size={14} className="run-row-cta-arrow" />
        </span>
      </Link>
    )
  }

  return (
    <div className="run-row run-row--actions" style={toolAccentStyle(tool.accent)}>
      {body}
      <div className="run-row-actions">
        {props.actions}
        {props.href ? (
          <Link to={props.href} className="run-row-cta run-row-open" aria-label={`Open ${label}`}>
            <span>Open</span>
            <ArrowRight size={14} className="run-row-cta-arrow" />
          </Link>
        ) : null}
      </div>
    </div>
  )
}

export function RunRowSkeleton() {
  return (
    <div className="run-row run-row--skeleton">
      <Skeleton className="run-row-skeleton-icon" />
      <div className="run-row-skeleton-body">
        <Skeleton className="run-row-skeleton-meta" />
        <Skeleton className="run-row-skeleton-label" />
      </div>
      <Skeleton className="run-row-skeleton-cta" />
    </div>
  )
}
