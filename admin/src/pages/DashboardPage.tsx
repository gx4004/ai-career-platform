import { useQuery } from '@tanstack/react-query'
import { getStats, getAdminHealth } from '#/lib/api'

export function DashboardPage() {
  const stats = useQuery({ queryKey: ['admin-stats'], queryFn: getStats })
  const health = useQuery({ queryKey: ['admin-health'], queryFn: getAdminHealth })

  return (
    <div>
      <h1 className="admin-page-title">Dashboard</h1>

      <div className="stats-grid">
        <StatCard label="Total Users" value={stats.data?.total_users ?? '—'} />
        <StatCard label="Total Runs" value={stats.data?.total_runs ?? '—'} />
        <StatCard label="Runs Today" value={stats.data?.runs_today ?? '—'} />
        <StatCard label="Active Users (7d)" value={stats.data?.active_users_7d ?? '—'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="tool-breakdown">
          <h3>Runs by Tool</h3>
          {stats.data?.runs_by_tool && Object.entries(stats.data.runs_by_tool).map(([tool, count]) => (
            <div key={tool} className="tool-breakdown-row">
              <span>{tool}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{count}</span>
            </div>
          ))}
          {!stats.data?.runs_by_tool && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading...</p>}
        </div>

        <div className="tool-breakdown">
          <h3>System Health</h3>
          {health.data ? (
            <>
              <div className="tool-breakdown-row">
                <span>Database</span>
                <span style={{ color: health.data.database === 'ok' ? 'var(--success)' : 'var(--error)' }}>
                  {health.data.database}
                </span>
              </div>
              <div className="tool-breakdown-row">
                <span>LLM Provider</span>
                <span>{health.data.llm_provider} / {health.data.llm_model}</span>
              </div>
              <div className="tool-breakdown-row">
                <span>Cache</span>
                <span>{health.data.cache_enabled ? `Enabled (${health.data.cache_entries} entries)` : 'Disabled'}</span>
              </div>
              <div className="tool-breakdown-row">
                <span>Environment</span>
                <span>{health.data.environment}</span>
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading...</p>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="stat-card">
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value}</div>
    </div>
  )
}
