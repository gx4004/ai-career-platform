import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { STAGE_TONE, STAGES, stageOf } from '#/components/applications/stages'
import {
  Button,
  ErrorState,
  List,
  Panel,
  PanelFooter,
  RoundStamp,
  Row,
  RowBody,
  RowMeta,
  RowTitle,
  Section,
  Skeleton,
  StageMark,
} from '#/components/kit'
import { getApplicationInsights, listApplications } from '#/lib/api/client'
import { APPLICATION_BOARD_QUERY_KEY, APPLICATION_INSIGHTS_QUERY_KEY } from '#/lib/query/applicationCaches'

/** The bar of a stage: proportional to the busiest stage, never a sliver for a stage that has something. */
function barWidth(count: number, max: number) {
  if (count <= 0 || max <= 0) return 0
  return Math.max(6, Math.round((count / max) * 100))
}

/** The applications by stage as bars, and the reply rate with the numbers behind it. */
export function DashboardPipeline() {
  const board = useQuery({ queryKey: APPLICATION_BOARD_QUERY_KEY, queryFn: listApplications })
  const insights = useQuery({ queryKey: APPLICATION_INSIGHTS_QUERY_KEY, queryFn: getApplicationInsights })
  const items = board.data?.items ?? []
  const counts = STAGES.map((stage) => items.filter((item) => stageOf(item.status) === stage.id).length)
  const max = Math.max(0, ...counts)
  const rate = insights.data?.overall.reply_rate ?? null
  const applied = insights.data?.overall.applied ?? 0
  const replied = insights.data?.overall.replied ?? 0

  return (
    <Section
      title="Pipeline"
      data-tour="quick-start"
      actions={
        board.isPending ? null : (
          <Button asChild variant="link" size="sm">
            <Link to="/campaigns">Applications</Link>
          </Button>
        )
      }
    >
      {board.isError ? (
        <ErrorState
          title="Your pipeline couldn't be loaded"
          onRetry={() => void board.refetch()}
          retrying={board.isFetching}
        />
      ) : board.isPending ? (
        <Panel flush role="status" aria-label="Loading your pipeline">
          <List framed={false} aria-busy>
            <Skeleton variant="row" as="li" count={STAGES.length} density="compact" />
          </List>
        </Panel>
      ) : (
        <Panel flush>
          <List framed={false} className="dash-pipeline" aria-label="Applications by stage">
            {STAGES.map((stage, index) => (
              <Row key={stage.id} density="compact">
                <StageMark
                  stage={stage.id}
                  variant="count"
                  count={counts[index]}
                  {...(items.length === 0 ? { 'data-tone': 'stone' } : {})}
                />
                <RowBody>
                  <RowTitle>{stage.label}</RowTitle>
                </RowBody>
                <RowMeta className="dash-bar-col">
                  {counts[index] > 0 ? (
                    <span
                      className="kit-tone dash-bar"
                      data-tone={STAGE_TONE[stage.id]}
                      aria-hidden="true"
                      style={{ inlineSize: `${barWidth(counts[index], max)}%` }}
                    />
                  ) : null}
                </RowMeta>
              </Row>
            ))}
          </List>
          {rate !== null ? (
            <PanelFooter tone="mint" className="dash-reply">
              <div className="dash-reply__text">
                <strong>Reply rate</strong>
                <span>
                  {replied} of {applied} {applied === 1 ? 'application' : 'applications'} replied
                </span>
              </div>
              <RoundStamp value={rate} unit="%" label={`Reply rate ${rate}%, ${replied} of ${applied} applications replied`} />
            </PanelFooter>
          ) : null}
        </Panel>
      )}
    </Section>
  )
}
