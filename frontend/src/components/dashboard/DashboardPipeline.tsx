import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { STAGES, stageOf } from '#/components/applications/stages'
import { getApplicationInsights, listApplications } from '#/lib/api/client'
import { APPLICATION_BOARD_QUERY_KEY, APPLICATION_INSIGHTS_QUERY_KEY } from '#/lib/query/applicationCaches'

/** One row of the application stages with counts, plus the overall reply rate. */
export function DashboardPipeline() {
  const board = useQuery({ queryKey: APPLICATION_BOARD_QUERY_KEY, queryFn: listApplications })
  const insights = useQuery({ queryKey: APPLICATION_INSIGHTS_QUERY_KEY, queryFn: getApplicationInsights })
  const items = board.data?.items ?? []
  const rate = insights.data?.overall.reply_rate ?? null

  return (
    <section className="dash-section" aria-labelledby="dash-pipeline" data-tour="quick-start">
      <div className="dash-section__head">
        <h2 className="dash-section__title" id="dash-pipeline">Pipeline</h2>
        {rate !== null ? (
          <span className="dash-section__meta">{rate}% reply rate</span>
        ) : null}
      </div>
      <ul className="dash-pipeline">
        {STAGES.map((stage) => {
          const count = board.data ? items.filter((item) => stageOf(item.status) === stage.id).length : null
          return (
            <li key={stage.id}>
              <Link
                to="/campaigns"
                className={`dash-pipeline__stage${stage.id === 'closed' ? ' is-muted' : ''}`}
                aria-label={`${stage.label}: ${count ?? 0}`}
              >
                <span className="dash-pipeline__count">{count ?? '—'}</span>
                <span className="dash-pipeline__label">{stage.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
