import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Shield, ShieldOff } from 'lucide-react'
import { getAdminUsers, setAdminStatus } from '#/lib/api/admin'
import type { AdminUserListResponse } from '#/lib/api/admin'

export function AdminUsersPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const { data, isLoading } = useQuery<AdminUserListResponse>({
    queryKey: ['admin-users', page, search],
    queryFn: () => getAdminUsers({ page, page_size: 20, q: search || undefined }),
  })

  const toggleAdmin = useMutation({
    mutationFn: ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) =>
      setAdminStatus(userId, isAdmin),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  const rangeStart = data ? (data.page - 1) * data.page_size + 1 : 0
  const rangeEnd = data ? Math.min(data.page * data.page_size, data.total) : 0

  return (
    <div>
      <h1 className="admin-page-title">Users</h1>
      <div className="admin-data-table-wrap">
        <form className="admin-data-table-toolbar" onSubmit={handleSearch}>
          <input
            type="search"
            className="admin-table-search-input"
            placeholder="Search by email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{
              flex: 1,
              padding: '0.4rem 0.75rem',
              border: '1px solid var(--border-subtle, #e5e7eb)',
              borderRadius: 6,
              fontSize: '0.875rem',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '0.4rem 1rem',
              background: 'var(--sidebar-bg, #0f1a2e)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Search
          </button>
        </form>

        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Runs</th>
              <th>Role</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center' }} className="admin-table-muted">
                  Loading…
                </td>
              </tr>
            )}
            {data?.items.map((user) => (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td className="admin-table-muted">{user.full_name || '—'}</td>
                <td className="admin-table-mono">{user.run_count}</td>
                <td>
                  {user.is_admin ? (
                    <span className="admin-badge admin-badge--admin">Admin</span>
                  ) : (
                    <span className="admin-table-muted">—</span>
                  )}
                </td>
                <td className="admin-table-muted">
                  {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                </td>
                <td>
                  <button
                    className="admin-icon-btn"
                    onClick={() =>
                      toggleAdmin.mutate({ userId: user.id, isAdmin: !user.is_admin })
                    }
                    title={user.is_admin ? 'Remove admin' : 'Make admin'}
                  >
                    {user.is_admin ? <ShieldOff size={15} /> : <Shield size={15} />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {data && (
          <div className="admin-pagination">
            <span>
              Showing {rangeStart}–{rangeEnd} of {data.total}
            </span>
            <div className="admin-pagination-controls">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                style={{
                  padding: '0.3rem 0.75rem',
                  border: '1px solid var(--border-subtle, #e5e7eb)',
                  borderRadius: 5,
                  background: '#fff',
                  cursor: page <= 1 ? 'default' : 'pointer',
                  opacity: page <= 1 ? 0.4 : 1,
                  fontSize: '0.8rem',
                }}
              >
                Previous
              </button>
              <button
                disabled={page * data.page_size >= data.total}
                onClick={() => setPage(page + 1)}
                style={{
                  padding: '0.3rem 0.75rem',
                  border: '1px solid var(--border-subtle, #e5e7eb)',
                  borderRadius: 5,
                  background: '#fff',
                  cursor: page * data.page_size >= data.total ? 'default' : 'pointer',
                  opacity: page * data.page_size >= data.total ? 0.4 : 1,
                  fontSize: '0.8rem',
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
