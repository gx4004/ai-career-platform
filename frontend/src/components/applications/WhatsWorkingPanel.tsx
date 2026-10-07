import { useQuery } from '@tanstack/react-query'
import { Disclosure, EmptyState, List, Panel, Row, RowBody, RowMeta, RowTitle, RoundStamp, ScoreBar, Section, Stack } from '#/components/kit'
import { getApplicationInsights } from '#/lib/api/client'
import type { InsightSegment, InsightsDimension } from '#/lib/api/schemas'
import { APPLICATION_INSIGHTS_QUERY_KEY } from '#/lib/query/applicationCaches'

const applications = (n: number) => `${n} application${n === 1 ? '' : 's'}`

/**
 * "What's working": how often applications got a reply (an interview or an
 * offer), overall and by segment. Each signal is its own list, never blended,
 * and every rate shows how many applications it rests on.
 */
export function WhatsWorkingPanel({ compact = false }: { compact?: boolean }) {
  const query = useQuery({ queryKey: APPLICATION_INSIGHTS_QUERY_KEY, queryFn: getApplicationInsights })
  const data = query.data
  // The applications page mounts this once the insights are in (a short placeholder that then grew into the
  // full panel pushed everything under it down), so there is no loading state; a failure just leaves it out.
  if (!data) return null
  const { overall } = data
  return (
    // Open on a desk once there is something to read; folded on a phone, where the page is already long.
    <Panel as="section" className="camp-insights">
      <Disclosure title="What's working" size="lg" ruled headingLevel={2} defaultOpen={!compact && overall.applied > 0}>
        <Stack gap={4} className="camp-insights__body">
          <p className="camp-note">
            A reply is an interview or an offer. A rate shows once a group has {data.min_segment_size} or more applications.
          </p>
          {overall.applied === 0 ? (
            <EmptyState
              size="inline"
              title="Nothing to learn from yet."
              description="Once you have applied, keep each application's stage up to date: move it to Interviewing or Offer when an employer replies, and mark it No reply when you hear nothing. That is what teaches this page which jobs are worth your time."
            />
          ) : (
            <>
              <div className="camp-insights__rate">
                <RoundStamp
                  value={overall.reply_rate ?? '–'}
                  unit={overall.reply_rate !== null ? '%' : undefined}
                  size={88}
                  label={overall.reply_rate !== null ? `Reply rate ${overall.reply_rate}%` : 'Reply rate not available yet'}
                />
                <p className="camp-note">
                  {overall.replied} of {applications(overall.applied)} got a reply
                  {overall.applied < data.min_segment_size ? ' (too few to read much into yet)' : ''}
                </p>
              </div>
              <div className="camp-insights__grid">
                {data.dimensions
                  .filter((dimension) => dimension.segments.length > 0)
                  .map((dimension) => <Dimension key={dimension.key} dimension={dimension} />)}
              </div>
            </>
          )}
        </Stack>
      </Disclosure>
    </Panel>
  )
}

const hasRate = (segment: InsightSegment) => segment.enough_data && segment.reply_rate !== null

function Dimension({ dimension }: { dimension: InsightsDimension }) {
  const rated = dimension.segments.filter(hasRate)
  const thin = dimension.segments.filter((segment) => !hasRate(segment))
  return (
    // Row-title type (Section xs, 15/700 UI): at the sub-section scale (20/800) the four groups were exactly as loud as
    // the panel's own "What's working" (consistency-F29), which matches the Prepare panel's title beside it.
    <Section headingLevel={3} size="xs" landmark title={dimension.title}>
      {rated.length > 0 ? (
        <List aria-label={dimension.title} framed={false} flush boxed className="camp-segments">
          {rated.map((segment) => <Segment key={segment.label} segment={segment} />)}
        </List>
      ) : null}
      {thin.length > 0 ? (
        <p className="camp-note">
          Not enough data yet: {thin.map((segment) => `${segment.label} (${segment.applied})`).join(', ')}
        </p>
      ) : null}
      {dimension.hidden_count > 0 ? (
        <p className="camp-note">+ {dimension.hidden_count} more with fewer applications</p>
      ) : null}
    </Section>
  )
}

function Segment({ segment }: { segment: InsightSegment }) {
  return (
    <Row density="compact">
      <RowBody>
        {/* Regular weight: the group's heading above is the bold row-title type (consistency-F29), the segments are its data. */}
        <RowTitle weight="regular">{segment.label}</RowTitle>
      </RowBody>
      <RowMeta>
        <ScoreBar
          aria-label={`${segment.reply_rate}%, ${segment.replied} of ${applications(segment.applied)}`}
          layout="inline"
          size="sm"
          value={segment.reply_rate ?? 0}
          valueLabel={
            <>
              {`${segment.reply_rate}%`} <span className="camp-sample">of {segment.applied}</span>
            </>
          }
        />
      </RowMeta>
    </Row>
  )
}
