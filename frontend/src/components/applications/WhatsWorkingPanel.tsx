import { useQuery } from '@tanstack/react-query'
import { useBreakpoint } from '#/hooks/use-breakpoint'
import { Panel } from './Panel'
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
  const phone = useBreakpoint() === 'mobile'
  const query = useQuery({ queryKey: APPLICATION_INSIGHTS_QUERY_KEY, queryFn: getApplicationInsights })
  const data = query.data
  if (query.isError) return null
  if (!data) {
    return (
      <Panel title="What's working" className="camp-insights">
        <p className="camp-muted" role="status">Counting your outcomes…</p>
      </Panel>
    )
  }
  const { overall } = data
  const body = (
    <>
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
    </>
  )
  if (phone) {
    return (
      <details className="camp-panel camp-insights camp-disclosure">
        <summary className="camp-panel__title">What's working</summary>
        <div className="camp-panel__body">{body}</div>
      </details>
    )
  }
  return (
    <Panel
      title="What's working"
      description={`A reply is an interview or an offer. A rate shows once a group has ${data.min_segment_size} or more applications.`}
      className="camp-insights"
    >
      {body}
    </Panel>
  )
}

const hasRate = (segment: InsightSegment) => segment.enough_data && segment.reply_rate !== null

function Dimension({ dimension }: { dimension: InsightsDimension }) {
  const rated = dimension.segments.filter(hasRate)
  const thin = dimension.segments.filter((segment) => !hasRate(segment))
  return (
    <section className="camp-insights__group" aria-label={dimension.title}>
      <h3>{dimension.title}</h3>
      {rated.length > 0 ? (
        <ul>
          {rated.map((segment) => <Segment key={segment.label} segment={segment} />)}
        </ul>
      ) : null}
      {thin.length > 0 ? (
        <p className="camp-muted">
          Not enough data yet: {thin.map((segment) => `${segment.label} (${segment.applied})`).join(', ')}
        </p>
      ) : null}
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
      <span className="camp-insights__track" aria-hidden="true">
        <span className="camp-insights__fill" style={{ width: `${Math.max(segment.reply_rate ?? 0, 2)}%` }} />
      </span>
      <span
        className="camp-insights__value"
        aria-label={`${segment.reply_rate}%, ${segment.replied} of ${applications(segment.applied)}`}
      >
        <span aria-hidden="true">{`${segment.reply_rate}%`}</span>
        <small aria-hidden="true">n={segment.applied}</small>
      </span>
    </li>
  )
}
