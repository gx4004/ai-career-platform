import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAdminProfileAdoption } from '#/lib/api/admin'
import type { AdminProfileAdoption } from '#/lib/api/admin'

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

// The Evidence Profile adoption view answers "is the profile being adopted and
// trusted?" from the same first-party analytics store (D-067, #150). Every
// figure is a bounded low-cardinality count over allowlisted profile events —
// created counts by kind and provenance class, and confirm/reject trust
// decisions. No evidence content is ever reachable here. Plain tables only, no
// charting library (ADR 0001) — consistent with the R6 activation dashboard.
export function AdminProfileAdoptionPage() {
  const [start, setStart] = useState(() => isoDaysAgo(14))
  const [end, setEnd] = useState(() => isoDaysAgo(0))

  const { data, isLoading, isError } = useQuery<AdminProfileAdoption>({
    queryKey: ['admin-profile-adoption', start, end],
    queryFn: () =>
      getAdminProfileAdoption({
        start: start ? `${start}T00:00:00` : undefined,
        end: end ? `${end}T23:59:59` : undefined,
      }),
    staleTime: 30_000,
  })

  return (
    <div>
      <h1 className="admin-page-title">Profile Adoption</h1>

      <div className="admin-data-table-wrap">
        <div className="admin-data-table-toolbar">
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
            Failed to load profile adoption metrics.
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
            <div className="admin-info-panel-title">Lifecycle</div>
            <div className="admin-info-row">
              <span className="admin-info-row-label">Items created</span>
              <span className="admin-info-row-value">
                {data.total_created.toLocaleString()}
              </span>
            </div>
            <div className="admin-info-row">
              <span className="admin-info-row-label">Items deleted</span>
              <span className="admin-info-row-value">
                {data.total_deleted.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="admin-info-panel">
            <div className="admin-info-panel-title">Trust decisions</div>
            {data.confirmation_transitions.length === 0 && (
              <p className="admin-table-muted">No confirm/reject decisions in range.</p>
            )}
            {data.confirmation_transitions.map((t) => (
              <div key={t.transition} className="admin-info-row">
                <span className="admin-info-row-label">{t.transition}</span>
                <span className="admin-info-row-value">{t.count.toLocaleString()}</span>
              </div>
            ))}
          </div>

          <div className="admin-info-panel">
            <div className="admin-info-panel-title">Created by provenance</div>
            {data.created_by_provenance.length === 0 && (
              <p className="admin-table-muted">No items created in range.</p>
            )}
            {data.created_by_provenance.map((p) => (
              <div key={p.provenance} className="admin-info-row">
                <span className="admin-info-row-label">{p.provenance}</span>
                <span className="admin-info-row-value">{p.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && (
        <div className="admin-data-table-wrap" style={{ marginTop: '1.5rem' }}>
          <div className="admin-info-panel-title" style={{ padding: '1rem 1rem 0' }}>
            Created by kind
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Kind</th>
                <th>Items created</th>
              </tr>
            </thead>
            <tbody>
              {data.created_by_kind.length === 0 && (
                <tr>
                  <td colSpan={2} className="admin-table-muted" style={{ textAlign: 'center' }}>
                    No items created in range.
                  </td>
                </tr>
              )}
              {data.created_by_kind.map((k) => (
                <tr key={k.kind}>
                  <td>
                    <span className="admin-badge admin-badge--tool">{k.kind}</span>
                  </td>
                  <td className="admin-table-muted">{k.count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
