import { useQuery } from '@tanstack/react-query'
import { getAdminScorecard } from '#/lib/api/admin'
import type { AdminScorecard, ScorecardTrigger, TriggerState } from '#/lib/api/admin'

// Read-only, so state colour is presentational only. No dark-mode toggle in the
// admin panel (hybrid theme), so these are single-value inline styles like the
// sibling activation page.
const STATE_STYLE: Record<TriggerState, { bg: string; fg: string; label: string }> = {
  fired: { bg: '#fee2e2', fg: '#991b1b', label: 'Fired' },
  not_fired: { bg: '#dcfce7', fg: '#166534', label: 'Not fired' },
  insufficient_sample: { bg: '#fef9c3', fg: '#854d0e', label: 'Insufficient sample' },
}

function fmtTimestamp(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

function StateBadge({ state }: { state: TriggerState }) {
  const s = STATE_STYLE[state]
  return (
    <span
      className="admin-badge"
      style={{ background: s.bg, color: s.fg }}
      aria-label={`Trigger state: ${s.label}`}
    >
      {s.label}
    </span>
  )
}

function TriggerRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-info-row">
      <span className="admin-info-row-label">{label}</span>
      <span className="admin-info-row-value" style={{ textAlign: 'right', maxWidth: '70%' }}>
        {value}
      </span>
    </div>
  )
}

function TriggerCard({ trigger }: { trigger: ScorecardTrigger }) {
  const detail = Object.entries(trigger.evidence_detail)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ')

  return (
    <div className="admin-info-panel" style={{ marginBottom: '1.25rem' }}>
      <div
        className="admin-info-panel-title"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}
      >
        <span>{trigger.label}</span>
        <StateBadge state={trigger.state} />
      </div>

      <p className="admin-table-muted" style={{ margin: '0.5rem 0 0.75rem' }}>
        {trigger.evidence}
      </p>

      {trigger.review_required && (
        <p
          style={{ margin: '0 0 0.75rem', color: '#991b1b', fontWeight: 600 }}
          role="status"
        >
          Review required — threshold crossed. No response is enabled automatically.
        </p>
      )}

      <TriggerRow label="Threshold" value={trigger.threshold} />
      <TriggerRow label="Observation window" value={trigger.observation_window} />
      <TriggerRow label="Minimum sample" value={trigger.minimum_sample} />
      <TriggerRow
        label="Evidence freshness"
        value={
          trigger.evidence_fresh
            ? `Fresh (last ${fmtTimestamp(trigger.last_evidence_at)})`
            : 'Stale / no in-window evidence'
        }
      />
      {detail && <TriggerRow label="Current evidence" value={detail} />}
      <TriggerRow label="Owner" value={trigger.owner} />
      <TriggerRow label="Rollback" value={trigger.rollback} />
      <TriggerRow label="Exit criteria" value={trigger.exit_criteria} />
      <TriggerRow
        label="Response (deferred)"
        value={`#${trigger.response_ticket} — ${trigger.response_ticket_title}`}
      />
    </div>
  )
}

export function AdminScorecardPage() {
  const { data, isLoading, isError } = useQuery<AdminScorecard>({
    queryKey: ['admin-scorecard'],
    queryFn: () => getAdminScorecard(),
    staleTime: 30_000,
  })

  return (
    <div>
      <h1 className="admin-page-title">Scaling Triggers (R10)</h1>

      <p className="admin-table-muted" style={{ marginBottom: '1.25rem' }}>
        Read-only operational scaling-trigger scorecard. Each trigger reports whether its
        predeclared threshold has fired from measured first-party evidence. A fired trigger
        only asks for review of its deferred response ticket — nothing is scaled
        automatically.
      </p>

      {isError && (
        <div className="admin-data-table-wrap">
          <p className="admin-table-muted admin-error-text" style={{ padding: '1rem' }}>
            Failed to load the scaling-trigger scorecard.
          </p>
        </div>
      )}
      {isLoading && (
        <div className="admin-data-table-wrap">
          <p className="admin-table-muted" style={{ padding: '1rem' }}>
            Loading…
          </p>
        </div>
      )}

      {data && (
        <>
          <p className="admin-table-muted" style={{ marginBottom: '1rem' }}>
            Topology: <strong>{data.replica_class}</strong> · Generated{' '}
            {fmtTimestamp(data.generated_at)}
          </p>
          {data.triggers.map((trigger) => (
            <TriggerCard key={trigger.id} trigger={trigger} />
          ))}
        </>
      )}
    </div>
  )
}
