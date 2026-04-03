import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { getAdminRuns, getAdminRun } from '#/lib/api/admin'
import type { AdminRunListResponse, AdminRunDetail } from '#/lib/api/admin'
import { toolList } from '#/lib/tools/registry'

const TOOL_IDS = toolList.map((t) => t.id)

export function AdminRunsPage() {
  const [page, setPage] = useState(1)
  const [toolFilter, setToolFilter] = useState('')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  // Clear selection when filter changes
  useEffect(() => {
    setSelectedRunId(null)
  }, [toolFilter])

  const { data, isLoading, isError } = useQuery<AdminRunListResponse>({
    queryKey: ['admin-runs', page, toolFilter],
    queryFn: () => getAdminRuns({ page, page_size: 20, tool: toolFilter || undefined }),
    staleTime: 30_000,
  })

  const runDetail = useQuery<AdminRunDetail>({
    queryKey: ['admin-run', selectedRunId],
    queryFn: () => getAdminRun(selectedRunId!),
    enabled: !!selectedRunId,
  })

  const rangeStart = data ? (data.page - 1) * data.page_size + 1 : 0
  const rangeEnd = data ? Math.min(data.page * data.page_size, data.total) : 0

  return (
    <div>
      <h1 className="admin-page-title">Runs</h1>
      <div className="admin-data-table-wrap">
        <div className="admin-data-table-toolbar">
          <select
            className="admin-toolbar-select"
            value={toolFilter}
            onChange={(e) => {
              setToolFilter(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All tools</option>
            {TOOL_IDS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <table className="admin-table">
          <thead>
            <tr>
              <th>Tool</th>
              <th>User</th>
              <th>Label</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="admin-table-muted" style={{ textAlign: 'center' }}>
                  Loading…
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={4} className="admin-table-muted" style={{ textAlign: 'center', color: '#dc2626' }}>
                  Failed to load runs.
                </td>
              </tr>
            )}
            {data?.items.map((run) => (
              <tr
                key={run.id}
                className="is-clickable"
                onClick={() => setSelectedRunId(run.id)}
              >
                <td>
                  <span className="admin-badge admin-badge--tool">{run.tool_name}</span>
                </td>
                <td className="admin-table-muted">{run.user_email || run.user_id.slice(0, 8)}</td>
                <td className="admin-table-muted">{run.label || '—'}</td>
                <td className="admin-table-muted">
                  {run.created_at ? new Date(run.created_at).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {data && (
          <div className="admin-pagination">
            <span>
              Showing {rangeStart}–{rangeEnd} of {data.total}
            </span>
            <div className="admin-pagination-controls">
              <button
                className="admin-pagination-btn"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <button
                className="admin-pagination-btn"
                disabled={page * data.page_size >= data.total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Run detail modal */}
      {selectedRunId && (
        <div className="admin-modal-backdrop" onClick={() => setSelectedRunId(null)}>
          <div className="admin-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">Run Detail</h2>
              <button className="admin-icon-btn" onClick={() => setSelectedRunId(null)}>
                <X size={20} />
              </button>
            </div>

            {runDetail.isLoading && <p className="admin-table-muted">Loading…</p>}
            {runDetail.isError && (
              <p className="admin-table-muted admin-error-text">
                Failed to load run detail.
              </p>
            )}

            {runDetail.data && (
              <>
                <div className="admin-modal-meta">
                  <div>
                    <span className="admin-table-muted">Tool: </span>
                    {runDetail.data.tool_name}
                  </div>
                  <div>
                    <span className="admin-table-muted">User: </span>
                    {runDetail.data.user_email || runDetail.data.user_id}
                  </div>
                  <div>
                    <span className="admin-table-muted">Label: </span>
                    {runDetail.data.label || '—'}
                  </div>
                  <div>
                    <span className="admin-table-muted">Created: </span>
                    {runDetail.data.created_at
                      ? new Date(runDetail.data.created_at).toLocaleString()
                      : '—'}
                  </div>
                  {runDetail.data.feedback_text && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span className="admin-table-muted">Feedback: </span>
                      {runDetail.data.feedback_text}
                    </div>
                  )}
                </div>

                <div className="admin-modal-section-label">Result Payload</div>
                <pre className="admin-json-viewer">
                  {JSON.stringify(runDetail.data.result_payload, null, 2)}
                </pre>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
