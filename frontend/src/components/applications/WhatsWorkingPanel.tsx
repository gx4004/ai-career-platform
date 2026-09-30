import { useQuery } from '@tanstack/react-query'
import { WorkspacePanel } from '#/components/app/WorkspacePage'
import { getApplicationInsights } from '#/lib/api/client'
import type { InsightSegment, InsightsDimension } from '#/lib/api/schemas'
import { APPLICATION_INSIGHTS_QUERY_KEY } from '#/lib/query/applicationCaches'

const applications = (n: number) => `${n} application${n === 1 ? '' : 's'}`

/**
 * "What's working": how often applications got a reply (an interview or an
 * offer), overall and by segment. Each signal is its own list, never blended,
 * and every rate shows how many applications it rests on.
 */
export function WhatsWorkingPanel() {
  const query = useQuery({ queryKey: APPLICATION_INSIGHTS_QUERY_KEY, queryFn: getApplicationInsights })
  const data = query.data
  if (query.isError) return null
  if (!data) {
    return (
      <WorkspacePanel kicker="What's working" title="Which jobs reply" className="camp-insights">
        <p className="camp-muted" role="status">Counting your outcomes…</p>
      </WorkspacePanel>
    )
  }
  const { overall } = data
  return (
    <WorkspacePanel
      kicker="What's working"
      title="Which jobs reply"
      description="A reply is an interview or an offer. Each list below stands on its own, and a rate only shows once a group has enough applications behind it."
      className="camp-insights"
    >
      {overall.applied === 0 ? (
        <div className="camp-insights__empty">
          <p><strong>Nothing to learn from yet.</strong></p>
          <p className="camp-muted">
            Once you have applied, keep each application's stage up to date: move it to Interviewing
            or Offer when an employer replies, and mark it No reply when you hear nothing. That is
            what teaches this page which jobs are worth your time.
          </p>
        </div>
      ) : (
        <>
          <p className="camp-insights__overall">
            <strong>{overall.reply_rate !== null ? `${overall.reply_rate}%` : '-'}</strong>
            <span>
              {overall.replied} of {applications(overall.applied)} got a reply
              {overall.applied < data.min_segment_size ? ' (too few to read much into yet)' : ''}
            </span>
          </p>
          <div className="camp-insights__grid">
            {data.dimensions
              .filter((dimension) => dimension.segments.length > 0)
              .map((dimension) => <Dimension key={dimension.key} dimension={dimension} />)}
          </div>
        </>
      )}
    </WorkspacePanel>
  )
}

function Dimension({ dimension }: { dimension: InsightsDimension }) {
  return (
    <section className="camp-insights__group" aria-label={dimension.title}>
      <h3>{dimension.title}</h3>
      <ul>
        {dimension.segments.map((segment) => <Segment key={segment.label} segment={segment} />)}
      </ul>
      {dimension.hidden_count > 0 ? (
        <p className="camp-muted">+ {dimension.hidden_count} more with fewer applications</p>
      ) : null}
    </section>
  )
}

function Segment({ segment }: { segment: InsightSegment }) {
  return (
    <li className="camp-insights__row">
      <span className="camp-insights__label">{segment.label}</span>
      {segment.enough_data && segment.reply_rate !== null ? (
        <>
          <span className="score-bar__track camp-insights__track" aria-hidden="true">
            <span className="score-bar__fill" style={{ width: `${Math.max(segment.reply_rate, 2)}%` }} />
          </span>
          <span className="camp-insights__value">
            {segment.reply_rate}%
            <small> {segment.replied} of {segment.applied}</small>
          </span>
        </>
      ) : (
        <span className="camp-insights__thin">Not enough data yet ({applications(segment.applied)})</span>
      )}
    </li>
  )
}
