import { Link } from '@tanstack/react-router'
import { Row, RowBody, RowMeta, RowSubtitle, RowTitle } from '#/components/kit'
import type { HistoryToolDisplay } from '#/lib/tools/historyToolLabel'

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

/**
 * One saved run: its label (the whole row opens it), the tool underneath, the date at the end.
 * Older CV Studio runs have no page to open and show as plain text.
 */
export function RunRow({
  tool,
  label,
  date,
  href,
}: {
  tool: HistoryToolDisplay
  label: string
  /** Pre-formatted short date. */
  date?: string
  /** Where the run opens, or null when no page can open it. */
  href: string | null
}) {
  // "Job Match (75%)" already says which tool made it; saying "Match" under it again is noise.
  const namesTool = label.toLowerCase().includes(tool.label.toLowerCase())
  return (
    <Row>
      <RowBody>
        {href ? (
          <RowTitle asChild>
            <Link to={href}>{label}</Link>
          </RowTitle>
        ) : (
          <RowTitle>{label}</RowTitle>
        )}
        {namesTool ? null : <RowSubtitle>{tool.label}</RowSubtitle>}
      </RowBody>
      {date ? <RowMeta>{date}</RowMeta> : null}
    </Row>
  )
}
