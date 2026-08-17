import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  adminOperationalToolIdSchema,
  getAdminActivation,
  getAdminEvalRuns,
} from '#/lib/api/admin'
import type {
  AdminAccessMode,
  AdminActivation,
  AdminEvalRuns,
  AdminOperationalToolId,
  EvalRunItem,
} from '#/lib/api/admin'
import { toolList } from '#/lib/tools/registry'

const operationalTools: { id: AdminOperationalToolId; label: string }[] = [
  ...toolList,
  { id: 'application-reviewer', label: 'Application Reviewer' },
  { id: 'application-packet', label: 'Application Packet' },
  { id: 'cv-quality', label: 'CV Quality' },
  { id: 'cv-tailoring', label: 'CV Tailoring' },
]

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

function fmtTimestamp(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

// Resume / Job Match carry a calibration miss rate plus an explanation
// inconsistency count (places the rendered explanation contradicts the numbers
// in the same response, D-121); the four generative tools carry a
// fabrication-candidate count and an LLM-as-judge usefulness score. Only one
// branch is populated per tool (see backend `ToolReport`). A report written
// before the explanation check existed carries `null` there, which stays
// unrendered — absent means "not measured", never "zero contradictions".
function fmtQuality(item: EvalRunItem): string {
  if (item.calibration_miss_rate !== null) {
    const calibration = `Miss rate ${(item.calibration_miss_rate * 100).toFixed(1)}%`
    if (item.explanation_inconsistency_count === null) return calibration
    return `${calibration} · Explanation ${item.explanation_inconsistency_count}`
  }
  const parts: string[] = []
  if (item.fabrication_candidate_count !== null) {
    parts.push(`Fabrication ${item.fabrication_candidate_count}`)
  }
  if (item.usefulness_score !== null) {
    parts.push(`Usefulness ${item.usefulness_score.toFixed(2)}/5`)
  }
  return parts.length > 0 ? parts.join(' · ') : '—'
}

export function EvalRunsSection() {
  const { data, isLoading, isError } = useQuery<AdminEvalRuns>({
    queryKey: ['admin-eval-runs'],
    queryFn: () => getAdminEvalRuns(),
    staleTime: 30_000,
  })

  return (
    <div className="admin-data-table-wrap" style={{ marginTop: '1.5rem' }}>
      <div className="admin-info-panel-title" style={{ padding: '1rem 1rem 0' }}>
        Eval Runs (quality)
      </div>
      {isError && (
        <p className="admin-table-muted admin-error-text" style={{ padding: '1rem' }}>
          Failed to load eval runs.
        </p>
      )}
      {isLoading && (
        <p className="admin-table-muted" style={{ padding: '1rem' }}>
          Loading…
        </p>
      )}
      {data && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Tool</th>
              <th>Quality</th>
              <th>Prompt version</th>
              <th>Last run</th>
            </tr>
          </thead>
          <tbody>
            {data.tools.map((t) => (
              <tr key={t.tool_id}>
                <td>
                  <span className="admin-badge admin-badge--tool">{t.tool_id}</span>
                </td>
                {t.has_report ? (
                  <>
                    <td className="admin-table-muted">{fmtQuality(t)}</td>
                    <td className="admin-table-muted">{t.prompt_version ?? '—'}</td>
                    <td className="admin-table-muted">{fmtTimestamp(t.generated_at)}</td>
                  </>
                ) : (
                  <td colSpan={3} className="admin-table-muted">
                    No eval run yet
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function AdminActivationPage() {
  const [accessMode, setAccessMode] = useState<'' | AdminAccessMode>('')
  const [toolId, setToolId] = useState<'' | AdminOperationalToolId>('')
  const [start, setStart] = useState(() => isoDaysAgo(14))
  const [end, setEnd] = useState(() => isoDaysAgo(0))

  const { data, isLoading, isError } = useQuery<AdminActivation>({
    queryKey: ['admin-activation', accessMode, toolId, start, end],
    queryFn: () =>
      getAdminActivation({
        access_mode: accessMode || undefined,
        tool_id: toolId || undefined,
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
          <select
            className="admin-toolbar-select"
            value={toolId}
            onChange={(e) => setToolId(
              e.target.value ? adminOperationalToolIdSchema.parse(e.target.value) : '',
            )}
            aria-label="Tool"
          >
            <option value="">All tools</option>
            {operationalTools.map((tool) => (
              <option key={tool.id} value={tool.id}>{tool.label}</option>
            ))}
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

      <EvalRunsSection />
    </div>
  )
}
