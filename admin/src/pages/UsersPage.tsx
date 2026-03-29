import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getUsers, setUserAdmin } from '#/lib/api'
import { Shield, ShieldOff } from 'lucide-react'

export function UsersPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', page, search],
    queryFn: () => getUsers({ page, page_size: 20, q: search || undefined }),
  })

  const toggleAdmin = useMutation({
    mutationFn: ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) =>
      setUserAdmin(userId, isAdmin),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  return (
    <div>
      <h1 className="admin-page-title">Users</h1>
      <div className="data-table-wrap">
        <form className="data-table-toolbar" onSubmit={handleSearch}>
          <input
            className="data-table-input"
            placeholder="Search by email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button type="submit" className="login-btn" style={{ width: 'auto', padding: '8px 16px', marginTop: 0 }}>
            Search
          </button>
        </form>
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Runs</th>
              <th>Role</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</td></tr>
            )}
            {data?.items.map((user) => (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td>{user.full_name || '—'}</td>
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{user.run_count}</td>
                <td>{user.is_admin ? <span className="badge badge-admin">Admin</span> : '—'}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                </td>
                <td>
                  <button
                    onClick={() => toggleAdmin.mutate({ userId: user.id, isAdmin: !user.is_admin })}
                    title={user.is_admin ? 'Remove admin' : 'Make admin'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                  >
                    {user.is_admin ? <ShieldOff size={16} /> : <Shield size={16} />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && (
          <div className="pagination">
            <span>
              Showing {(data.page - 1) * data.page_size + 1}–{Math.min(data.page * data.page_size, data.total)} of {data.total}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <button disabled={page * data.page_size >= data.total} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
