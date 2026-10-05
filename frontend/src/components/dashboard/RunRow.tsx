import { Link } from '@tanstack/react-router'
import { Badge, MetaRow, Row, RowBody, RowMeta, RowSubtitle, RowTitle, type Tone } from '#/components/kit'
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

/** "Job Match (75%)" is the name and the score: the score is drawn as a pill, the name stays the link. */
function splitScore(label: string): { name: string; score: string | null } {
  const match = /^(.*\S)\s*\((\d{1,3}(?:\.\d+)?%|\d{1,3}\/\d{1,3})\)$/.exec(label)
  return match ? { name: match[1], score: match[2] } : { name: label, score: null }
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
  scoreTone,
}: {
  tool: HistoryToolDisplay
  label: string
  /** Pre-formatted short date. */
  date?: string
  /** Where the run opens, or null when no page can open it. */
  href: string | null
  /** The tool's colour, for its score pill. */
  scoreTone?: Tone
}) {
  const { name, score } = splitScore(label)
  // "Job Match (75%)" already says which tool made it; saying "Match" under it again is noise.
  const namesTool = name.toLowerCase().includes(tool.label.toLowerCase())
  const facts = [namesTool ? null : tool.label, date || null]
  return (
    <Row>
      <RowBody>
        {href ? (
          <RowTitle asChild>
            <Link to={href}>{name}</Link>
          </RowTitle>
        ) : (
          <RowTitle>{name}</RowTitle>
        )}
        {facts.some(Boolean) ? (
          <RowSubtitle>
            <MetaRow>{facts}</MetaRow>
          </RowSubtitle>
        ) : null}
      </RowBody>
      {score ? (
        <RowMeta>
          <Badge tone={scoreTone ?? 'white'} className="dash-score">
            {score}
          </Badge>
        </RowMeta>
      ) : null}
    </Row>
  )
}
