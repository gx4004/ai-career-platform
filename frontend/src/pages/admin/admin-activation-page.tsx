import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAdminActivation } from '#/lib/api/admin'
import type { AdminAccessMode, AdminActivation } from '#/lib/api/admin'

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function fmtCost(value: number | string | null): string {
  if (value === null || value === undefined) return '—'
  const n = typeof value === 'string' ? Number(value) : value
  if (Number.isNaN(n)) return '—'
  return `$${n.toFixed(6)}`
}

function fmtDuration(value: number | null): string {
  if (value === null || value === undefined) return '—'
  return `${Math.round(value).toLocaleString()} ms`
}

export function AdminActivationPage() {
  const [accessMode, setAccessMode] = useState<'' | AdminAccessMode>('')
  const [start, setStart] = useState(() => isoDaysAgo(14))
  const [end, setEnd] = useState(() => isoDaysAgo(0))

  const { data, isLoading, isError } = useQuery<AdminActivation>({
    queryKey: ['admin-activation', accessMode, start, end],
    queryFn: () =>
      getAdminActivation({
        access_mode: accessMode || undefined,
        start: start ? `${start}T00:00:00` : undefined,
        end: end ? `${end}T23:59:59` : undefined,
      }),
    staleTime: 30_000,
  })

  return (
    <div>
      <h1 className="admin-page-title">Activation</h1>

      <div className="admin-data-table-wrap">
        <div className="admin-data-table-toolbar">
          <select
            className="admin-toolbar-select"
            value={accessMode}
            onChange={(e) => setAccessMode(e.target.value as '' | AdminAccessMode)}
            aria-label="Access mode"
          >
            <option value="">All access modes</option>
            <option value="authenticated">Authenticated</option>
            <option value="guest_demo">Guest</option>
          </select>
          <input
            className="admin-toolbar-input"
            type="date"
            value={start}
            max={end}
            onChange={(e) => setStart(e.target.value)}
            aria-label="Start date"
          />
          <input
            className="admin-toolbar-input"
            type="date"
            value={end}
            min={start}
            onChange={(e) => setEnd(e.target.value)}
            aria-label="End date"
          />
        </div>

        {isError && (
          <p className="admin-table-muted admin-error-text" style={{ padding: '1rem' }}>
            Failed to load activation metrics.
          </p>
        )}
        {isLoading && (
          <p className="admin-table-muted" style={{ padding: '1rem' }}>
            Loading…
          </p>
        )}
      </div>

      {data && (
        <div className="admin-info-grid" style={{ marginTop: '1.5rem' }}>
          <div className="admin-info-panel">
            <div className="admin-info-panel-title">Funnel</div>
            {data.funnel.map((step) => (
              <div key={step.step} className="admin-info-row">
                <span className="admin-info-row-label">{step.label}</span>
                <span className="admin-info-row-value">{step.count.toLocaleString()}</span>
              </div>
            ))}
          </div>

          <div className="admin-info-panel">
            <div className="admin-info-panel-title">Failures by category</div>
            {data.failures.length === 0 && <p className="admin-table-muted">No failures in range.</p>}
            {data.failures.map((f) => (
              <div key={f.failure_category} className="admin-info-row">
                <span className="admin-info-row-label">{f.failure_category}</span>
                <span className="admin-info-row-value">{f.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && (
        <div className="admin-data-table-wrap" style={{ marginTop: '1.5rem' }}>
          <div className="admin-info-panel-title" style={{ padding: '1rem 1rem 0' }}>
            Per-tool latency &amp; cost
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Tool</th>
                <th>Runs</th>
                <th>Avg latency</th>
                <th>Total cost</th>
                <th>Avg cost</th>
              </tr>
            </thead>
            <tbody>
              {data.tools.length === 0 && (
                <tr>
                  <td colSpan={5} className="admin-table-muted" style={{ textAlign: 'center' }}>
                    No tool runs in range.
                  </td>
                </tr>
              )}
              {data.tools.map((t) => (
                <tr key={t.tool_id}>
                  <td>
                    <span className="admin-badge admin-badge--tool">{t.tool_id}</span>
                  </td>
                  <td className="admin-table-muted">{t.runs.toLocaleString()}</td>
                  <td className="admin-table-muted">{fmtDuration(t.avg_duration_ms)}</td>
                  <td className="admin-table-muted">{fmtCost(t.total_cost_estimate)}</td>
                  <td className="admin-table-muted">{fmtCost(t.avg_cost_estimate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
