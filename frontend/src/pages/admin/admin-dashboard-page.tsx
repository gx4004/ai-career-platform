import { useQuery } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Cluster,
  EmptyState,
  KeyValue,
  List,
  Notice,
  Page,
  PageHeader,
  Row,
  RowBody,
  RowMeta,
  RowTitle,
  Section,
  Skeleton,
  Stat,
} from '#/components/kit'
import { getAdminStats, getAdminHealth } from '#/lib/api/admin'
import type { AdminStats, AdminHealth } from '#/lib/api/admin'
import { toolLabel } from './toolLabel'

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

  return (
    <Page>
      <PageHeader title="Dashboard" />

      {stats.isError ? (
        <Retry what="stats" onRetry={() => void stats.refetch()} />
      ) : stats.isLoading ? (
        <Skeleton variant="stat" count={4} className="admin-stats" />
      ) : stats.data ? (
        <Cluster gap={8} align="start" className="admin-stats">
          <Stat label="Total users" value={stats.data.total_users} />
          <Stat label="Total runs" value={stats.data.total_runs} />
          <Stat label="Runs today" value={stats.data.runs_today} />
          <Stat label="Active users (7d)" value={stats.data.active_users_7d} />
        </Cluster>
      ) : null}

      <div className="admin-columns">
        {stats.isError ? null : (
          <Section title="Runs by tool">
            {stats.isLoading ? (
              <Skeleton lines={4} label="Loading runs by tool" />
            ) : stats.data && byTool.length === 0 ? (
              <EmptyState title="No runs yet" />
            ) : stats.data ? (
              <List aria-label="Runs by tool">
                {byTool.map((entry) => (
                  <Row key={entry.tool} density="compact">
                    <RowBody>
                      <RowTitle>{entry.label}</RowTitle>
                    </RowBody>
                    <RowMeta>{entry.count}</RowMeta>
                  </Row>
                ))}
              </List>
            ) : null}
          </Section>
        )}

        <Section title="System health">
          {health.isLoading ? <Skeleton lines={4} label="Loading system health" /> : null}
          {health.isError ? <Retry what="health" onRetry={() => void health.refetch()} /> : null}
          {health.data ? (
            <KeyValue
              items={[
                {
                  label: 'Database',
                  value:
                    health.data.database === 'ok' ? (
                      <Badge tone="success" dot>
                        Healthy
                      </Badge>
                    ) : (
                      <Badge tone="danger" dot>
                        {health.data.database}
                      </Badge>
                    ),
                },
                { label: 'LLM provider', value: `${health.data.llm_provider} / ${health.data.llm_model}` },
                {
                  label: 'Cache',
                  value: health.data.cache_enabled ? `Enabled (${health.data.cache_entries} entries)` : 'Disabled',
                },
                { label: 'Environment', value: health.data.environment },
              ]}
            />
          ) : null}
        </Section>
      </div>
    </Page>
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
