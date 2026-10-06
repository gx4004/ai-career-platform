import { Link } from '@tanstack/react-router'
import { Badge, MetaRow, Row, RowBody, RowMeta, RowSubtitle, RowTitle, type Tone } from '#/components/kit'
import type { HistoryToolDisplay } from '#/lib/tools/historyToolLabel'
import { splitScore } from '#/lib/tools/runLabel'

// Kept for the dashboard modules that import the date format from here; the one definition is in lib/tools/runLabel.
export { formatRunDate } from '#/lib/tools/runLabel'

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
          <Badge tone={scoreTone ?? 'white'} score>
            {score}
          </Badge>
        </RowMeta>
      ) : null}
    </Row>
  )
}
