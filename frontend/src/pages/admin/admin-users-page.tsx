import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  Notice,
  Page,
  PageHeader,
  Pagination,
  Stack,
  Table,
  Toolbar,
} from '#/components/kit'
import type { TableColumn } from '#/components/kit'
import { getAdminUsers, setAdminStatus } from '#/lib/api/admin'
import type { AdminUserItem, AdminUserListResponse } from '#/lib/api/admin'
import { adminDate } from './toolLabel'
import { countMeta } from './count-meta'

export function AdminUsersPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const { data, isLoading, isError, isFetching, refetch } = useQuery<AdminUserListResponse>({
    queryKey: ['admin-users', page, search],
    queryFn: () => getAdminUsers({ page, page_size: 20, q: search || undefined }),
    staleTime: 30_000,
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
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1

  const columns: TableColumn<AdminUserItem>[] = [
    {
      id: 'user',
      header: 'User',
      primary: true,
      cell: (user) => (
        <span className="admin-wrap">
          {user.email}
          {user.full_name ? <span className="admin-subline">{user.full_name}</span> : null}
        </span>
      ),
    },
    {
      id: 'role',
      header: 'Role',
      width: '7rem',
      cell: (user) => (user.is_admin ? <Badge tone="accent">Admin</Badge> : 'Member'),
    },
    { id: 'runs', header: 'Runs', numeric: true, width: '4.5rem', cell: (user) => user.run_count },
    {
      id: 'created',
      header: 'Created',
      width: '9rem',
      nowrap: true,
      cell: (user) => <span className="admin-after-number">{adminDate(user.created_at) || '—'}</span>,
    },
    {
      id: 'actions',
      header: 'Actions',
      hideHeader: true,
      align: 'end',
      width: '9.5rem',
      stackLabel: false,
      cell: (user) => {
        const pending = toggleAdmin.isPending && toggleAdmin.variables?.userId === user.id
        const label = user.is_admin ? 'Remove admin' : 'Make admin'
        return (
          <Button
            size="sm"
            variant="secondary"
            loading={pending}
            onClick={() => toggleAdmin.mutate({ userId: user.id, isAdmin: !user.is_admin })}
          >
            {label}
          </Button>
        )
      },
    },
  ]

  return (
    <Page>
      <PageHeader
        title="Users"
        meta={countMeta(data ? `${data.total} ${data.total === 1 ? 'user' : 'users'}` : null, isLoading)}
      />

      <Stack gap={3}>
        <form role="search" onSubmit={handleSearch}>
          <Toolbar
            search={
              <Input
                type="search"
                aria-label="Search users by email"
                leading={<Search aria-hidden />}
                placeholder="Search by email…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            }
            actions={
              <Button type="submit" variant="secondary">
                Search
              </Button>
            }
          />
        </form>

        {toggleAdmin.isError ? (
          <Notice tone="danger" onDismiss={() => toggleAdmin.reset()}>
            That role change could not be saved.
          </Notice>
        ) : null}

        {isError ? (
          <ErrorState
            title="Couldn't load users"
            onRetry={() => void refetch()}
            retrying={isFetching}
          />
        ) : (
          <Table
            caption="Users"
            columns={columns}
            rows={data?.items ?? []}
            getRowId={(user) => user.id}
            loading={isLoading}
            empty={<EmptyState title="No users found" />}
          />
        )}

        <Pagination
          variant="simple"
          aria-label="Users pages"
          page={page}
          pageCount={pageCount}
          onPageChange={setPage}
          summary={data ? `Showing ${rangeStart}–${rangeEnd} of ${data.total}` : undefined}
        />
      </Stack>
    </Page>
  )
}
