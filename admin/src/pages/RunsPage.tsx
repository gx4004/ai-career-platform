import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRuns, getRun } from '#/lib/api'
import { X } from 'lucide-react'

const TOOLS = ['resume', 'job-match', 'cover-letter', 'interview', 'career', 'portfolio']

export function RunsPage() {
  const [page, setPage] = useState(1)
  const [toolFilter, setToolFilter] = useState('')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-runs', page, toolFilter],
    queryFn: () => getRuns({ page, page_size: 20, tool: toolFilter || undefined }),
  })

  const runDetail = useQuery({
    queryKey: ['admin-run', selectedRunId],
    queryFn: () => getRun(selectedRunId!),
    enabled: !!selectedRunId,
  })

  return (
    <div>
      <h1 className="admin-page-title">Runs</h1>
      <div className="data-table-wrap">
        <div className="data-table-toolbar">
          <select
            className="data-table-select"
            value={toolFilter}
            onChange={(e) => { setToolFilter(e.target.value); setPage(1) }}
          >
            <option value="">All tools</option>
            {TOOLS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <table>
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
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</td></tr>
            )}
            {data?.items.map((run) => (
              <tr key={run.id} onClick={() => setSelectedRunId(run.id)} style={{ cursor: 'pointer' }}>
                <td><span className="badge badge-tool">{run.tool_name}</span></td>
                <td>{run.user_email || run.user_id.slice(0, 8)}</td>
                <td>{run.label || '—'}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  {run.created_at ? new Date(run.created_at).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && (
          <div className="pagination">
            <span>
              Showing {(data.page - 1) * data.page_size + 1}–{Math.min(data.page * data.page_size, data.total)} of {data.total}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <button disabled={page * data.page_size >= data.total} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>

      {selectedRunId && (
        <div className="modal-backdrop" onClick={() => setSelectedRunId(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Run Detail</h2>
              <button className="modal-close" onClick={() => setSelectedRunId(null)}>
                <X size={20} />
              </button>
            </div>
            {runDetail.isLoading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}
            {runDetail.data && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                  <div><span style={{ color: 'var(--text-muted)' }}>Tool:</span> {runDetail.data.tool_name}</div>
                  <div><span style={{ color: 'var(--text-muted)' }}>User:</span> {runDetail.data.user_email}</div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Label:</span> {runDetail.data.label || '—'}</div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Created:</span> {runDetail.data.created_at ? new Date(runDetail.data.created_at).toLocaleString() : '—'}</div>
                  {runDetail.data.feedback_text && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Feedback:</span> {runDetail.data.feedback_text}
                    </div>
                  )}
                </div>
                <h3 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Result Payload</h3>
                <div className="json-viewer">
                  {JSON.stringify(runDetail.data.result_payload, null, 2)}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
