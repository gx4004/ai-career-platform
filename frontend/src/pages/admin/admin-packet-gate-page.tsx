import { useQuery } from '@tanstack/react-query'
import { getAdminPacketGate, type AdminPacketGate } from '#/lib/api/admin'

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <span className="admin-health-metric">
      {label} <strong>{value}</strong>
    </span>
  )
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
        content, listing text, run ids, findings, or user data — aggregate counts
        only. A packet with an unresolved fabrication finding is never queued.
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
                <th>Gate outcomes (window)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div className="admin-health-metrics">
                    <Metric label="running" value={data.gate_running} />
                    <Metric label="passed" value={data.gate_passed} />
                    <Metric label="blocked" value={data.gate_blocked} />
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
