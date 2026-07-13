import { useQuery } from '@tanstack/react-query'
import { getAdminDiscoveryReports } from '#/lib/api/admin'

export function AdminDiscoveryReportsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-discovery-reports'],
    queryFn: getAdminDiscoveryReports,
    staleTime: 30_000,
  })

  return (
    <div>
      <h1 className="admin-page-title">Recommendation Reports</h1>
      <p className="admin-table-muted">
        User-filed recommendation errors. Each row shows the reported product listing
        and the reporter&apos;s reason — never the reporter&apos;s identity or any
        Evidence Profile content.
      </p>

      <div className="admin-data-table-wrap" style={{ marginTop: '1.5rem' }}>
        {isError && (
          <p className="admin-table-muted admin-error-text" style={{ padding: '1rem' }}>
            Failed to load recommendation reports.
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
                <th>Listing</th>
                <th>Source family</th>
                <th>Reason</th>
                <th>Filed</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={4} className="admin-table-muted">
                    No recommendation reports have been filed.
                  </td>
                </tr>
              )}
              {data.items.map((report) => (
                <tr key={report.id}>
                  <td>
                    <strong>{report.listing_title}</strong>
                    <div className="admin-table-muted">{report.listing_company}</div>
                  </td>
                  <td>
                    <span className="admin-badge admin-badge--tool">
                      {report.source_family}
                    </span>
                  </td>
                  <td>
                    <div>{report.reason_category}</div>
                    <div className="admin-table-muted">{report.reason}</div>
                  </td>
                  <td className="admin-table-muted">
                    {new Date(report.created_at).toLocaleString()}
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
