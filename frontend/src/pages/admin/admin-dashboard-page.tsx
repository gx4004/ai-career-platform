import { useQuery } from '@tanstack/react-query'
import {
  Badge,
  Button,
  EmptyState,
  KeyValue,
  List,
  Notice,
  Page,
  PageHeader,
  Panel,
  PanelBody,
  Row,
  RowBody,
  RowMeta,
  RowTitle,
  ScoreSeal,
  Section,
  Skeleton,
  Stat,
  ToolTile,
} from '#/components/kit'
import { getAdminStats, getAdminHealth } from '#/lib/api/admin'
import type { AdminStats, AdminHealth } from '#/lib/api/admin'
import { RunSparkline, dayLabel } from './run-sparkline'
import { RUN_DAYS, toDayCounts } from './runs-by-day'
import type { DayCount } from './runs-by-day'
import { toolLabel, toolVisual } from './toolLabel'

/** The bar of a tool: proportional to the busiest one, never a sliver for a tool that has runs. */
function barWidth(count: number, max: number) {
  if (count <= 0 || max <= 0) return 0
  return Math.max(6, Math.round((count / max) * 100))
}

export function AdminDashboardPage() {
  const stats = useQuery<AdminStats>({
    queryKey: ['admin-stats'],
    queryFn: getAdminStats,
    staleTime: 60_000,
  })
  const health = useQuery<AdminHealth>({
    queryKey: ['admin-health'],
    queryFn: getAdminHealth,
    staleTime: 60_000,
  })
  const byTool = stats.data
    ? Object.entries(stats.data.runs_by_tool)
        .sort(([, a], [, b]) => b - a)
        .map(([tool, count]) => ({ tool, label: toolLabel(tool), count }))
    : []
  const maxToolRuns = byTool[0]?.count ?? 0

  return (
    <Page>
      <PageHeader title="Dashboard" />

      {stats.isError ? (
        <Retry what="stats" onRetry={() => void stats.refetch()} />
      ) : (
        <div className="admin-stats">
          {stats.data ? (
            <>
              <StatPanel label="Total users" value={stats.data.total_users} />
              <StatPanel label="Total runs" value={stats.data.total_runs} />
              <StatPanel label="Runs today" value={stats.data.runs_today} />
              <StatPanel label="Active users (7d)" value={stats.data.active_users_7d} />
            </>
          ) : (
            Array.from({ length: 4 }, (_, index) => (
              <Panel key={index} aria-hidden>
                <PanelBody>
                  <Skeleton variant="stat" />
                </PanelBody>
              </Panel>
            ))
          )}
        </div>
      )}

      <div className="admin-columns">
        <div className="admin-column">
          {stats.isError ? null : (
            <Section title={`Runs, last ${RUN_DAYS} days`}>
              <ActivityPanel days={stats.data ? toDayCounts(stats.data.runs_by_day) : undefined} />
            </Section>
          )}

          {stats.isError ? null : (
            <Section title="Runs by tool">
              {stats.isLoading ? (
                <Panel flush>
                  <Skeleton variant="row" density="compact" leading count={6} label="Loading runs by tool" />
                </Panel>
              ) : stats.data && byTool.length === 0 ? (
                <EmptyState title="No runs yet" />
              ) : stats.data ? (
                <Panel flush>
                  <List framed={false} className="admin-tools" aria-label="Runs by tool">
                    {byTool.map((entry) => {
                      const visual = toolVisual(entry.tool)
                      return (
                        <Row key={entry.tool} density="compact">
                          <ToolTile size="sm" tone={visual.tone} icon={visual.icon} />
                          <RowBody>
                            <RowTitle>{entry.label}</RowTitle>
                          </RowBody>
                          <RowMeta className="admin-bar-col">
                            <span
                              className="kit-tone admin-bar"
                              data-tone={visual.tone}
                              aria-hidden="true"
                              style={{ inlineSize: `${barWidth(entry.count, maxToolRuns)}%` }}
                            />
                            <span className="admin-count">{entry.count}</span>
                          </RowMeta>
                        </Row>
                      )
                    })}
                  </List>
                </Panel>
              ) : null}
            </Section>
          )}
        </div>

        <Section title="System health">
          {health.isLoading ? (
            <Panel>
              <PanelBody className="admin-health">
                <Skeleton lines={5} label="Loading system health" />
              </PanelBody>
            </Panel>
          ) : null}
          {health.isError ? <Retry what="health" onRetry={() => void health.refetch()} /> : null}
          {health.data ? <HealthPanel health={health.data} /> : null}
        </Section>
      </div>
    </Page>
  )
}

function StatPanel({ label, value }: { label: string; value: number }) {
  return (
    <Panel>
      <PanelBody>
        <Stat label={label} value={value} />
      </PanelBody>
    </Panel>
  )
}

/** The server's per-day counts (UTC days, every day present): the whole window, never a floor. */
function ActivityPanel({ days }: { days: DayCount[] | undefined }) {
  if (!days) {
    return (
      <Panel aria-hidden>
        <PanelBody className="admin-activity admin-activity--loading">
          <Skeleton lines={3} />
        </PanelBody>
      </Panel>
    )
  }
  if (days.length === 0) return <EmptyState title="No run history" />
  const total = days.reduce((sum, day) => sum + day.count, 0)
  const busiest = days.reduce((best, day) => (day.count > best.count ? day : best), days[0])
  return (
    <Panel>
      <PanelBody className="admin-activity">
        <div className="admin-activity__chart">
          <RunSparkline days={days} />
          <div className="admin-activity__axis" aria-hidden="true">
            <span>{dayLabel(days[0].date)}</span>
            <span>Today</span>
          </div>
        </div>
        <dl className="admin-activity__facts">
          <div>
            <dt>Runs in {days.length} days</dt>
            <dd>{total}</dd>
          </div>
          <div>
            <dt>Busiest day</dt>
            <dd>{busiest.count > 0 ? `${dayLabel(busiest.date)} (${busiest.count})` : 'None yet'}</dd>
          </div>
        </dl>
      </PanelBody>
    </Panel>
  )
}

function HealthPanel({ health }: { health: AdminHealth }) {
  const databaseOk = health.database === 'ok'
  const llmConfigured = health.llm_provider.trim() !== ''
  const healthy = databaseOk && llmConfigured
  const fake = health.llm_provider === 'fake'
  return (
    <Panel>
      <PanelBody className="admin-health">
        {healthy ? (
          <div className="admin-health__verdict">
            <ScoreSeal value="OK" unit={null} label="System status" size={96} tone="mint" reveal="stamp" />
            <div>
              <p className="admin-health__title">All systems healthy</p>
              <p className="admin-subline">The database answers and an LLM provider is configured.</p>
            </div>
          </div>
        ) : null}
        <KeyValue
          items={[
            {
              label: 'Database',
              value: databaseOk ? (
                <Badge tone="success" dot>
                  Healthy
                </Badge>
              ) : (
                <Badge tone="danger" dot>
                  {health.database}
                </Badge>
              ),
            },
            {
              label: 'LLM provider',
              value: fake ? 'fake (local fixtures, no model)' : `${health.llm_provider} / ${health.llm_model}`,
            },
            {
              label: 'Cache',
              value: health.cache_enabled
                ? `Enabled (${health.cache_entries} ${health.cache_entries === 1 ? 'entry' : 'entries'})`
                : 'Disabled',
            },
            { label: 'Environment', value: health.environment },
          ]}
        />
      </PanelBody>
    </Panel>
  )
}

function Retry({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <Notice
      tone="danger"
      action={
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      }
    >
      Couldn't load {what}.
    </Notice>
  )
}
