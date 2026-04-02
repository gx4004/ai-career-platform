import { useQuery } from '@tanstack/react-query'
import { getAdminStats, getAdminHealth } from '#/lib/api/admin'
import type { AdminStats, AdminHealth } from '#/lib/api/admin'

export function AdminDashboardPage() {
  const stats = useQuery<AdminStats>({
    queryKey: ['admin-stats'],
    queryFn: getAdminStats,
  })
  const health = useQuery<AdminHealth>({
    queryKey: ['admin-health'],
    queryFn: getAdminHealth,
  })

  return (
    <div>
      <h1 className="admin-page-title">Dashboard</h1>

      <div className="admin-stat-grid">
        <StatCard label="Total Users" value={stats.data?.total_users} loading={stats.isLoading} />
        <StatCard label="Total Runs" value={stats.data?.total_runs} loading={stats.isLoading} />
        <StatCard label="Runs Today" value={stats.data?.runs_today} loading={stats.isLoading} />
        <StatCard label="Active Users (7d)" value={stats.data?.active_users_7d} loading={stats.isLoading} />
      </div>

      <div className="admin-info-grid">
        <div className="admin-info-panel">
          <div className="admin-info-panel-title">Runs by Tool</div>
          {stats.isLoading && <p className="admin-table-muted">Loading…</p>}
          {stats.data?.runs_by_tool &&
            Object.entries(stats.data.runs_by_tool)
              .sort(([, a], [, b]) => b - a)
              .map(([tool, count]) => (
                <div key={tool} className="admin-info-row">
                  <span className="admin-info-row-label">{tool}</span>
                  <span className="admin-info-row-value">{count}</span>
                </div>
              ))}
          {stats.data && Object.keys(stats.data.runs_by_tool).length === 0 && (
            <p className="admin-table-muted">No runs yet.</p>
          )}
        </div>

        <div className="admin-info-panel">
          <div className="admin-info-panel-title">System Health</div>
          {health.isLoading && <p className="admin-table-muted">Loading…</p>}
          {health.data && (
            <>
              <div className="admin-info-row">
                <span className="admin-info-row-label">Database</span>
                <span className={`admin-info-row-value ${health.data.database === 'ok' ? 'admin-info-row-value--ok' : 'admin-info-row-value--error'}`}>
                  {health.data.database}
                </span>
              </div>
              <div className="admin-info-row">
                <span className="admin-info-row-label">LLM Provider</span>
                <span className="admin-info-row-value">
                  {health.data.llm_provider} / {health.data.llm_model}
                </span>
              </div>
              <div className="admin-info-row">
                <span className="admin-info-row-label">Cache</span>
                <span className="admin-info-row-value">
                  {health.data.cache_enabled
                    ? `Enabled (${health.data.cache_entries} entries)`
                    : 'Disabled'}
                </span>
              </div>
              <div className="admin-info-row">
                <span className="admin-info-row-label">Environment</span>
                <span className="admin-info-row-value">{health.data.environment}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  loading,
}: {
  label: string
  value: number | undefined
  loading: boolean
}) {
  return (
    <div className="admin-stat-card">
      <div className="admin-stat-card-label">{label}</div>
      <div className="admin-stat-card-value">
        {loading ? '—' : (value ?? 0)}
      </div>
    </div>
  )
}
