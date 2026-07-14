import { useQuery } from '@tanstack/react-query'
import { getAdminPacketGate, type AdminPacketGate } from '#/lib/api/admin'

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <span className="admin-health-metric">
      {label} <strong>{value}</strong>
    </span>
  )
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : '—'
}

export function AdminPacketGatePage() {
  const { data, isLoading, isError } = useQuery<AdminPacketGate>({
    queryKey: ['admin-packet-gate'],
    queryFn: () => getAdminPacketGate(),
    staleTime: 30_000,
  })

  return (
    <div>
      <h1 className="admin-page-title">Packet Gate</h1>
      <p className="admin-table-muted">
        Trust-chain gate between packet preparation and the review queue. No packet
        content, listing text, run ids, findings, or user data — aggregate counts and
        the current halt posture only. A packet with an unresolved fabrication finding
        is never queued, and a failing regression evaluation halts preparation
        pipeline-wide until cleared.
      </p>

      <div className="admin-data-table-wrap" style={{ marginTop: '1.5rem' }}>
        {isError && (
          <p className="admin-table-muted admin-error-text" style={{ padding: '1rem' }}>
            Failed to load packet gate state.
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
                <th>Preparation</th>
                <th>Gate outcomes (window)</th>
                <th>Halt transitions (window)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  {data.halted ? (
                    <div>
                      <strong className="admin-error-text">Halted</strong>
                      <div className="admin-table-muted">
                        Reason: {data.halt_reason ?? '—'}
                      </div>
                      <div className="admin-table-muted">
                        Since {formatDate(data.halted_since)}
                      </div>
                    </div>
                  ) : (
                    <strong>Running</strong>
                  )}
                </td>
                <td>
                  <div className="admin-health-metrics">
                    <Metric label="running" value={data.gate_running} />
                    <Metric label="passed" value={data.gate_passed} />
                    <Metric label="blocked" value={data.gate_blocked} />
                  </div>
                </td>
                <td>
                  <div className="admin-health-metrics">
                    <Metric label="halted" value={data.pipeline_halted} />
                    <Metric label="cleared" value={data.pipeline_cleared} />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
