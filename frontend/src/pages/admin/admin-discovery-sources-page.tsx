import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getAdminDiscoverySources,
  setDiscoverySourceKillSwitch,
} from '#/lib/api/admin'
import type { DiscoverySource } from '#/lib/api/discoverySchemas'

export function AdminDiscoverySourcesPage() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-discovery-sources'],
    queryFn: getAdminDiscoverySources,
    staleTime: 30_000,
  })

  const killSwitch = useMutation({
    mutationFn: ({ sourceId, tripped }: { sourceId: string; tripped: boolean }) =>
      setDiscoverySourceKillSwitch(sourceId, tripped),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-discovery-sources'] })
      queryClient.invalidateQueries({ queryKey: ['admin-source-health'] })
    },
  })

  const pendingId =
    killSwitch.isPending && killSwitch.variables ? killSwitch.variables.sourceId : null

  return (
    <div>
      <h1 className="admin-page-title">Discovery Sources</h1>
      <p className="admin-table-muted">
        Governance registry plus the operator kill switch. A source can ingest only
        after an accepted terms review and while its kill switch is off. Tripping the
        kill switch halts a source immediately — no deploy or restart.
      </p>

      <div className="admin-data-table-wrap" style={{ marginTop: '1.5rem' }}>
        {isError && (
          <p className="admin-table-muted admin-error-text" style={{ padding: '1rem' }}>
            Failed to load discovery sources.
          </p>
        )}
        {isLoading && (
          <p className="admin-table-muted" style={{ padding: '1rem' }}>
            Loading…
          </p>
        )}
        {killSwitch.isError && (
          <p className="admin-table-muted admin-error-text" style={{ padding: '1rem' }}>
            Kill-switch change failed. A source cannot be cleared before its terms
            review is accepted.
          </p>
        )}
        {data && (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Governance</th>
                <th>Terms review</th>
                <th>Bounds</th>
                <th>Ingestion</th>
                <th>Kill switch</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="admin-table-muted">
                    No discovery sources are registered. Ingestion remains disabled.
                  </td>
                </tr>
              )}
              {data.items.map((source) => (
                <tr key={source.id}>
                  <td>
                    <strong>{source.display_name}</strong>
                    <div className="admin-table-muted">{source.source_key}</div>
                    <div className="admin-table-muted">{source.source_family}</div>
                  </td>
                  <td>
                    <div>{source.owner}</div>
                    <div className="admin-table-muted">{source.allowed_behavior}</div>
                    <div className="admin-table-muted">
                      {source.endpoint_url || 'Endpoint not configured'}
                    </div>
                    <div className="admin-table-muted">
                      Query: {source.allowed_query_parameters?.join(', ') || 'none'}
                    </div>
                    <div className="admin-table-muted">
                      Robots: {source.robots_policy || 'not configured'}
                    </div>
                    <div className="admin-table-muted">{source.attribution_rule}</div>
                  </td>
                  <td>
                    <span className="admin-badge admin-badge--tool">
                      {source.terms_status}
                    </span>
                    <div className="admin-table-muted">
                      {source.terms_reviewed_at
                        ? new Date(source.terms_reviewed_at).toLocaleDateString()
                        : 'Not reviewed'}
                    </div>
                    {source.terms_reviewed_by && (
                      <div className="admin-table-muted">
                        by {source.terms_reviewed_by}
                      </div>
                    )}
                  </td>
                  <td>
                    <div>{source.rate_limit_per_minute}/minute</div>
                    <div className="admin-table-muted">
                      Retain {source.retention_days} days
                    </div>
                  </td>
                  <td>
                    <strong>{source.ingestion_allowed ? 'Allowed' : 'Refused'}</strong>
                    <div className="admin-table-muted">
                      Kill switch {source.kill_switch ? 'on' : 'off'}
                    </div>
                  </td>
                  <td>
                    <KillSwitchControl
                      source={source}
                      busy={pendingId === source.id}
                      onTrip={() =>
                        killSwitch.mutate({ sourceId: source.id, tripped: true })
                      }
                      onClear={() =>
                        killSwitch.mutate({ sourceId: source.id, tripped: false })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function KillSwitchControl({
  source,
  busy,
  onTrip,
  onClear,
}: {
  source: DiscoverySource
  busy: boolean
  onTrip: () => void
  onClear: () => void
}) {
  if (source.kill_switch) {
    const canClear = source.terms_status === 'accepted'
    return (
      <div>
        <button
          type="button"
          className="admin-button"
          disabled={busy || !canClear}
          onClick={onClear}
        >
          {busy ? 'Working…' : 'Clear kill switch'}
        </button>
        {!canClear && (
          <div className="admin-table-muted">Accept terms review to clear.</div>
        )}
      </div>
    )
  }
  return (
    <button
      type="button"
      className="admin-button admin-button--danger"
      disabled={busy}
      onClick={onTrip}
    >
      {busy ? 'Working…' : 'Trip kill switch'}
    </button>
  )
}
