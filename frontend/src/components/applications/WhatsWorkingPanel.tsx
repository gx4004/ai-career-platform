import { useQuery } from '@tanstack/react-query'
import { Disclosure, EmptyState, List, Row, RowBody, RowMeta, RowTitle, ScoreBar, Section, Skeleton, Stack, Stat } from '#/components/kit'
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
  if (query.isError) return null
  if (!data) {
    return (
      <Section title="What's working">
        <Skeleton lines={2} label="Counting your outcomes…" />
      </Section>
    )
  }
  const { overall } = data
  return (
    // Open on a desk once there is something to read; folded on a phone, where the page is already long.
    <Disclosure title="What's working" headingLevel={2} defaultOpen={!compact && overall.applied > 0}>
      <Stack gap={4}>
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
            <Stat
              size="md"
              value={overall.reply_rate !== null ? `${overall.reply_rate}%` : '–'}
              label={
                <>
                  {overall.replied} of {applications(overall.applied)} got a reply
                  {overall.applied < data.min_segment_size ? ' (too few to read much into yet)' : ''}
                </>
              }
            />
            <div className="camp-insights__grid">
              {data.dimensions
                .filter((dimension) => dimension.segments.length > 0)
                .map((dimension) => <Dimension key={dimension.key} dimension={dimension} />)}
            </div>
          </>
        )}
      </Stack>
    </Disclosure>
  )
}

const hasRate = (segment: InsightSegment) => segment.enough_data && segment.reply_rate !== null

function Dimension({ dimension }: { dimension: InsightsDimension }) {
  const rated = dimension.segments.filter(hasRate)
  const thin = dimension.segments.filter((segment) => !hasRate(segment))
  return (
    <Section headingLevel={3} size="sm" landmark title={dimension.title}>
      {rated.length > 0 ? (
        <List aria-label={dimension.title}>
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
        <RowTitle>{segment.label}</RowTitle>
      </RowBody>
      <RowMeta>
        <ScoreBar
          aria-label={`${segment.reply_rate}%, ${segment.replied} of ${applications(segment.applied)}`}
          layout="inline"
          size="sm"
          tone="accent"
          value={segment.reply_rate ?? 0}
          valueLabel={
            <>
              {`${segment.reply_rate}%`} <span className="camp-sample">n={segment.applied}</span>
            </>
          }
        />
      </RowMeta>
    </Row>
  )
}
