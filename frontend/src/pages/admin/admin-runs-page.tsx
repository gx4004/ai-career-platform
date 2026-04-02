import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { getAdminRuns, getAdminRun } from '#/lib/api/admin'
import type { AdminRunListResponse, AdminRunDetail } from '#/lib/api/admin'

const TOOLS = ['resume', 'job-match', 'cover-letter', 'interview', 'career', 'portfolio']

export function AdminRunsPage() {
  const [page, setPage] = useState(1)
  const [toolFilter, setToolFilter] = useState('')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  const { data, isLoading } = useQuery<AdminRunListResponse>({
    queryKey: ['admin-runs', page, toolFilter],
    queryFn: () => getAdminRuns({ page, page_size: 20, tool: toolFilter || undefined }),
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
            value={toolFilter}
            onChange={(e) => {
              setToolFilter(e.target.value)
              setPage(1)
            }}
            style={{
              padding: '0.4rem 0.75rem',
              border: '1px solid var(--border-subtle, #e5e7eb)',
              borderRadius: 6,
              fontSize: '0.875rem',
              background: '#fff',
            }}
          >
            <option value="">All tools</option>
            {TOOLS.map((t) => (
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
                <td colSpan={4} style={{ textAlign: 'center' }} className="admin-table-muted">
                  Loading…
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
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                style={{
                  padding: '0.3rem 0.75rem',
                  border: '1px solid var(--border-subtle, #e5e7eb)',
                  borderRadius: 5,
                  background: '#fff',
                  cursor: page <= 1 ? 'default' : 'pointer',
                  opacity: page <= 1 ? 0.4 : 1,
                  fontSize: '0.8rem',
                }}
              >
                Previous
              </button>
              <button
                disabled={page * data.page_size >= data.total}
                onClick={() => setPage(page + 1)}
                style={{
                  padding: '0.3rem 0.75rem',
                  border: '1px solid var(--border-subtle, #e5e7eb)',
                  borderRadius: 5,
                  background: '#fff',
                  cursor: page * data.page_size >= data.total ? 'default' : 'pointer',
                  opacity: page * data.page_size >= data.total ? 0.4 : 1,
                  fontSize: '0.8rem',
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Run detail modal */}
      {selectedRunId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
          onClick={() => setSelectedRunId(null)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              width: '90%',
              maxWidth: 720,
              maxHeight: '85vh',
              overflow: 'auto',
              padding: '1.5rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Run Detail</h2>
              <button
                className="admin-icon-btn"
                onClick={() => setSelectedRunId(null)}
              >
                <X size={20} />
              </button>
            </div>

            {runDetail.isLoading && (
              <p className="admin-table-muted">Loading…</p>
            )}

            {runDetail.data && (
              <>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.75rem',
                    marginBottom: '1.25rem',
                    fontSize: '0.875rem',
                  }}
                >
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

                <div
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--text-muted, #6b7280)',
                    marginBottom: '0.5rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Result Payload
                </div>
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
