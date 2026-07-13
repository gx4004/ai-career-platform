import { useQuery } from '@tanstack/react-query'
import { getAdminSourceHealth, type SourceFamilyHealth } from '#/lib/api/admin'

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <span className="admin-health-metric">
      {label} <strong>{value}</strong>
    </span>
  )
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : '—'
}

export function AdminSourceHealthPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-source-health'],
    queryFn: () => getAdminSourceHealth(),
    staleTime: 30_000,
  })

  return (
    <div>
      <h1 className="admin-page-title">Source Health</h1>
      <p className="admin-table-muted">
        Per-source-family operational health. Aggregate counts only — no listing
        content, full URLs, or user data. Fetch, ingest, dedup, and expiry counts
        cover the current window; registry posture, listing volume, and staleness are
        current state.
        {data
          ? ` A listing is stale after ${data.staleness_threshold_days} days without a refresh.`
          : ''}
      </p>

      <div className="admin-data-table-wrap" style={{ marginTop: '1.5rem' }}>
        {isError && (
          <p className="admin-table-muted admin-error-text" style={{ padding: '1rem' }}>
            Failed to load source health.
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
                <th>Source family</th>
                <th>Registry</th>
                <th>Listings</th>
                <th>Fetch outcomes</th>
                <th>Ingest / dedup / expiry</th>
              </tr>
            </thead>
            <tbody>
              {data.families.map((family: SourceFamilyHealth) => (
                <tr key={family.source_family}>
                  <td>
                    <strong>{family.source_family}</strong>
                  </td>
                  <td>
                    <div className="admin-health-metrics">
                      <Metric label="registered" value={family.source_count} />
                      <Metric label="active" value={family.active_count} />
                      <Metric label="killed" value={family.killed_count} />
                      <Metric label="pending terms" value={family.pending_terms_count} />
                    </div>
                  </td>
                  <td>
                    <div className="admin-health-metrics">
                      <Metric label="volume" value={family.listing_count} />
                      <Metric label="stale" value={family.stale_count} />
                    </div>
                    <div className="admin-table-muted">
                      Oldest {formatDate(family.oldest_retrieved_at)} · Newest{' '}
                      {formatDate(family.newest_retrieved_at)}
                    </div>
                  </td>
                  <td>
                    <div className="admin-health-metrics">
                      <Metric label="success" value={family.fetch_success} />
                      <Metric label="failure" value={family.fetch_failure} />
                      <Metric label="blocked" value={family.fetch_blocked} />
                    </div>
                  </td>
                  <td>
                    <div className="admin-health-metrics">
                      <Metric label="ingested" value={family.ingested} />
                      <Metric label="deduplicated" value={family.deduplicated} />
                      <Metric label="expired" value={family.expired} />
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
