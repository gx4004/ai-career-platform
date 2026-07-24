import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getAdminDevelopmentLoop,
  type AdminDevelopmentLoop,
} from '#/lib/api/admin'

function isoDaysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

function label(value: string): string {
  return value.replaceAll('_', ' ')
}

export function AdminDevelopmentLoopPage() {
  const [start, setStart] = useState(() => isoDaysAgo(14))
  const [end, setEnd] = useState(() => isoDaysAgo(0))

  const { data, isLoading, isError } = useQuery<AdminDevelopmentLoop>({
    queryKey: ['admin-development-loop', start, end],
    queryFn: () =>
      getAdminDevelopmentLoop({
        start: start ? `${start}T00:00:00` : undefined,
        end: end ? `${end}T23:59:59.999999` : undefined,
      }),
    staleTime: 30_000,
  })

  return (
    <div>
      <h1 className="admin-page-title">Development Loop</h1>

      <div className="admin-data-table-wrap">
        <div className="admin-data-table-toolbar">
          <input
            className="admin-toolbar-input"
            type="date"
            value={start}
            max={end}
            onChange={(event) => setStart(event.target.value)}
            aria-label="Start date"
          />
          <input
            className="admin-toolbar-input"
            type="date"
            value={end}
            min={start}
            onChange={(event) => setEnd(event.target.value)}
            aria-label="End date"
          />
        </div>
        {isError && (
          <p className="admin-table-muted admin-error-text" style={{ padding: '1rem' }}>
            Failed to load development loop metrics.
          </p>
        )}
        {isLoading && (
          <p className="admin-table-muted" style={{ padding: '1rem' }}>
            Loading…
          </p>
        )}
      </div>

      {data && (
        <>
          <div className="admin-info-grid" style={{ marginTop: '1.5rem' }}>
            <div className="admin-info-panel">
              <div className="admin-info-panel-title">Lifecycle</div>
              <div className="admin-info-row">
                <span className="admin-info-row-label">Items created</span>
                <span className="admin-info-row-value">
                  {data.total_items_created.toLocaleString()}
                </span>
              </div>
              <div className="admin-info-row">
                <span className="admin-info-row-label">Items deleted</span>
                <span className="admin-info-row-value">
                  {data.total_items_deleted.toLocaleString()}
                </span>
              </div>
              <div className="admin-info-row">
                <span className="admin-info-row-label">State transitions</span>
                <span className="admin-info-row-value">
                  {data.total_state_transitions.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="admin-info-panel">
              <div className="admin-info-panel-title">Created by gap kind</div>
              {data.created_by_gap_kind.length === 0 && (
                <p className="admin-table-muted">No items created in range.</p>
              )}
              {data.created_by_gap_kind.map((row) => (
                <div key={row.gap_kind} className="admin-info-row">
                  <span className="admin-info-row-label">{label(row.gap_kind)}</span>
                  <span className="admin-info-row-value">{row.count.toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div className="admin-info-panel">
              <div className="admin-info-panel-title">Created by response</div>
              {data.created_by_response_kind.length === 0 && (
                <p className="admin-table-muted">No items created in range.</p>
              )}
              {data.created_by_response_kind.map((row) => (
                <div key={row.response_kind} className="admin-info-row">
                  <span className="admin-info-row-label">
                    {label(row.response_kind)}
                  </span>
                  <span className="admin-info-row-value">{row.count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="admin-data-table-wrap" style={{ marginTop: '1.5rem' }}>
            <div className="admin-info-panel-title" style={{ padding: '1rem 1rem 0' }}>
              State transitions
            </div>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Transition</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {data.state_transitions.length === 0 && (
                  <tr>
                    <td
                      colSpan={2}
                      className="admin-table-muted"
                      style={{ textAlign: 'center' }}
                    >
                      No state transitions in range.
                    </td>
                  </tr>
                )}
                {data.state_transitions.map((row) => (
                  <tr key={`${row.from_state}-${row.to_state}`}>
                    <td>{`${label(row.from_state)} → ${label(row.to_state)}`}</td>
                    <td className="admin-table-muted">{row.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
