import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { STAGES, stageOf } from '#/components/applications/stages'
import { Button, ErrorState, Section, Skeleton, Stat } from '#/components/kit'
import { getApplicationInsights, listApplications } from '#/lib/api/client'
import { APPLICATION_BOARD_QUERY_KEY, APPLICATION_INSIGHTS_QUERY_KEY } from '#/lib/query/applicationCaches'

/** The applications by stage, plus the overall reply rate. */
export function DashboardPipeline() {
  const board = useQuery({ queryKey: APPLICATION_BOARD_QUERY_KEY, queryFn: listApplications })
  const insights = useQuery({ queryKey: APPLICATION_INSIGHTS_QUERY_KEY, queryFn: getApplicationInsights })
  const items = board.data?.items ?? []
  const rate = insights.data?.overall.reply_rate ?? null

  return (
    <Section
      title="Pipeline"
      data-tour="quick-start"
      actions={
        board.isPending ? null : (
          <Button asChild variant="ghost" size="sm">
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
        <div className="dash-stats" role="status" aria-label="Loading your pipeline">
          {Array.from({ length: STAGES.length + 1 }, (_, index) => (
            <Skeleton key={index} variant="stat" />
          ))}
        </div>
      ) : (
        <div className="dash-stats">
          {STAGES.map((stage) => (
            <Stat
              key={stage.id}
              label={stage.label}
              value={items.filter((item) => stageOf(item.status) === stage.id).length}
            />
          ))}
          {rate !== null ? <Stat label="Reply rate" value={rate} unit="%" /> : null}
        </div>
      )}
    </Section>
  )
}
