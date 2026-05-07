import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getAdminHealth,
  getAdminStats,
  getScoringMode,
  setScoringMode,
} from '#/lib/api/admin'
import type {
  AdminHealth,
  AdminScoringMode,
  AdminScoringModeResponse,
  AdminStats,
} from '#/lib/api/admin'

export function AdminDashboardPage() {
  const queryClient = useQueryClient()
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
  const scoringMode = useQuery<AdminScoringModeResponse>({
    queryKey: ['admin-scoring-mode'],
    queryFn: getScoringMode,
    staleTime: 30_000,
  })
  const scoringMutation = useMutation({
    mutationFn: (mode: AdminScoringMode) => setScoringMode(mode),
    onSuccess: (data) => {
      queryClient.setQueryData(['admin-scoring-mode'], data)
    },
  })

  return (
    <div>
      <h1 className="admin-page-title">Dashboard</h1>

      <div
        className="admin-info-panel"
        style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}
      >
        <div className="admin-info-panel-title">Scoring Mode</div>
        <p className="admin-table-muted" style={{ marginTop: 0, marginBottom: '0.75rem' }}>
          Toggle the analytical core between blended (LLM + heuristic) and fully heuristic
          modes. The change takes effect on the next analytical request.
        </p>
        {scoringMode.isLoading && <p className="admin-table-muted">Loading current mode…</p>}
        {scoringMode.isError && (
          <p className="admin-table-muted admin-error-text">Failed to load scoring mode.</p>
        )}
        {scoringMode.data && (
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => scoringMutation.mutate('blended')}
              disabled={scoringMutation.isPending || scoringMode.data.mode === 'blended'}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: '1px solid #333',
                background: scoringMode.data.mode === 'blended' ? '#1f6feb' : 'transparent',
                color: scoringMode.data.mode === 'blended' ? 'white' : 'inherit',
                cursor: scoringMode.data.mode === 'blended' ? 'default' : 'pointer',
              }}
            >
              Blended (LLM + heuristic)
            </button>
            <button
              type="button"
              onClick={() => scoringMutation.mutate('heuristic')}
              disabled={scoringMutation.isPending || scoringMode.data.mode === 'heuristic'}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: '1px solid #333',
                background: scoringMode.data.mode === 'heuristic' ? '#1f6feb' : 'transparent',
                color: scoringMode.data.mode === 'heuristic' ? 'white' : 'inherit',
                cursor: scoringMode.data.mode === 'heuristic' ? 'default' : 'pointer',
              }}
            >
              Heuristic only
            </button>
            <span className="admin-table-muted" style={{ marginLeft: 'auto', fontSize: '0.85rem' }}>
              version: <code>{scoringMode.data.heuristic_version}</code>
              {scoringMode.data.mode === 'blended' && (
                <> · blend {Math.round(scoringMode.data.blended_weight_heuristic * 100)}/{Math.round(scoringMode.data.blended_weight_llm * 100)}</>
              )}
            </span>
          </div>
        )}
        {scoringMutation.isError && (
          <p className="admin-error-text" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
            Failed to update scoring mode.
          </p>
        )}
      </div>

      {stats.isError && (
        <p className="admin-error-text" style={{ marginBottom: '1rem' }}>
          Failed to load stats.
        </p>
      )}

      <div className="admin-stat-grid">
        <StatCard label="Total Users" value={stats.data?.total_users} loading={stats.isLoading} error={stats.isError} />
        <StatCard label="Total Runs" value={stats.data?.total_runs} loading={stats.isLoading} error={stats.isError} />
        <StatCard label="Runs Today" value={stats.data?.runs_today} loading={stats.isLoading} error={stats.isError} />
        <StatCard label="Active Users (7d)" value={stats.data?.active_users_7d} loading={stats.isLoading} error={stats.isError} />
      </div>

      <div className="admin-info-grid">
        <div className="admin-info-panel">
          <div className="admin-info-panel-title">Runs by Tool</div>
          {stats.isLoading && <p className="admin-table-muted">Loading…</p>}
          {stats.isError && <p className="admin-table-muted admin-error-text">Failed to load.</p>}
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
          {health.isError && <p className="admin-table-muted admin-error-text">Failed to load.</p>}
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
  error,
}: {
  label: string
  value: number | undefined
  loading: boolean
  error: boolean
}) {
  let display: string | number = '—'
  if (!loading && !error && value !== undefined) display = value

  return (
    <div className="admin-stat-card">
      <div className="admin-stat-card-label">{label}</div>
      <div className="admin-stat-card-value">{display}</div>
    </div>
  )
}
