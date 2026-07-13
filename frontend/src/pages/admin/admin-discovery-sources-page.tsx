import { useQuery } from '@tanstack/react-query'
import { getAdminDiscoverySources } from '#/lib/api/admin'

export function AdminDiscoverySourcesPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-discovery-sources'],
    queryFn: getAdminDiscoverySources,
    staleTime: 30_000,
  })

  return (
    <div>
      <h1 className="admin-page-title">Discovery Sources</h1>
      <p className="admin-table-muted">
        Read-only governance registry. A source can ingest only after an accepted
        terms review and while its kill switch is off.
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
        {data && (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Governance</th>
                <th>Terms review</th>
                <th>Bounds</th>
                <th>Ingestion</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="admin-table-muted">
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
