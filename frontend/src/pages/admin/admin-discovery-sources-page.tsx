import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDate } from '#/components/applications/stages'
import {
  getAdminDiscoverySources,
  setDiscoverySourceKillSwitch,
} from '#/lib/api/admin'
import type { DiscoverySource } from '#/lib/api/discoverySchemas'

export function AdminDiscoverySourcesPage() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-discovery-sources'],
    queryFn: getAdminDiscoverySources,
    staleTime: 30_000,
  })

  const killSwitch = useMutation({
    mutationFn: ({ sourceId, tripped }: { sourceId: string; tripped: boolean }) =>
      setDiscoverySourceKillSwitch(sourceId, tripped),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-discovery-sources'] })
    },
  })

  const pendingId =
    killSwitch.isPending && killSwitch.variables ? killSwitch.variables.sourceId : null

  return (
    <div>
      <h1 className="admin-page-title">Discovery sources</h1>
      <p className="admin-intro">
        A source can ingest only after an accepted terms review and while its kill
        switch is off. Tripping the kill switch halts it immediately, with no deploy or restart.
      </p>

      <div className="admin-data-table-wrap">
        {isError && (
          <p className="admin-table-muted admin-error-text" style={{ padding: '1rem' }}>
            Couldn't load discovery sources.{' '}
            <button type="button" className="admin-toolbar-btn" onClick={() => void refetch()}>
              Try again
            </button>
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
                <th>Last fetch</th>
                <th>Kill switch</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="admin-table-muted">
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
                  <td className="admin-source-governance">
                    <div>{source.owner}</div>
                    <div className="admin-table-muted admin-source-url" title={source.endpoint_url ?? undefined}>
                      {source.endpoint_url || 'Endpoint not configured'}
                    </div>
                    <details className="admin-policy">
                      <summary>Policy</summary>
                      <div className="admin-table-muted">{source.allowed_behavior}</div>
                      <div className="admin-table-muted">{source.attribution_rule}</div>
                    </details>
                  </td>
                  <td>
                    <span className="admin-badge admin-badge--tool">
                      {source.terms_status}
                    </span>
                    <div className="admin-table-muted">
                      {source.terms_reviewed_at
                        ? formatDate(source.terms_reviewed_at)
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
                    <LastFetch source={source} />
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

function LastFetch({ source }: { source: DiscoverySource }) {
  if (!source.last_fetched_at) {
    return <span className="admin-table-muted">Never fetched</span>
  }
  const failed = source.last_outcome !== 'ok'
  return (
    <div>
      <div className={failed ? 'admin-fetch-failed' : undefined}>
        {failed ? source.last_outcome : 'OK'}
      </div>
      <div className="admin-table-muted">
        {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(source.last_fetched_at))}
      </div>
      <div className="admin-table-muted">
        {source.listing_count ?? 0} listings
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
