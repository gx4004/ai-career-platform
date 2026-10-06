import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import {
  Badge,
  Button,
  ConfirmDialog,
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
  useToast,
} from '#/components/kit'
import type { TableColumn } from '#/components/kit'
import { getAdminUsers, setAdminStatus } from '#/lib/api/admin'
import type { AdminUserItem, AdminUserListResponse } from '#/lib/api/admin'
import { useSession } from '#/hooks/useSession'
import { adminDate } from './toolLabel'
import { countMeta } from './count-meta'

/** Who is signed in, from the session (subscribed), so the page can keep an admin from changing their own role. */
function useCurrentUserId() {
  return useSession().user?.id ?? null
}

const displayName = (user: AdminUserItem) => user.full_name || user.email

/** The last role change, from the server's audit columns: "Made admin by x@y.com on Oct 6". The current role says which way it went. */
function roleAudit(user: AdminUserItem) {
  if (!user.role_changed_at) return null
  const what = user.is_admin ? 'Made admin' : 'Admin removed'
  const who = user.role_changed_by ? ` by ${user.role_changed_by}` : ''
  return `${what}${who} on ${adminDate(user.role_changed_at)}`
}

export function AdminUsersPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const currentUserId = useCurrentUserId()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [adminsOnly, setAdminsOnly] = useState(false)
  const [confirming, setConfirming] = useState<AdminUserItem | null>(null)

  const { data, isLoading, isError, isFetching, refetch } = useQuery<AdminUserListResponse>({
    queryKey: ['admin-users', page, search, adminsOnly],
    queryFn: () =>
      getAdminUsers({ page, page_size: 20, q: search || undefined, ...(adminsOnly ? { is_admin: true } : {}) }),
    staleTime: 30_000,
  })

  const toggleAdmin = useMutation({
    mutationFn: ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) =>
      setAdminStatus(userId, isAdmin),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  const confirmRoleChange = () => {
    if (!confirming) return
    const user = confirming
    const grant = !user.is_admin
    toggleAdmin.mutate(
      { userId: user.id, isAdmin: grant },
      {
        onSuccess: () => {
          toast({
            tone: 'success',
            title: grant ? `${displayName(user)} is now an admin` : `${displayName(user)} is no longer an admin`,
          })
        },
        onSettled: () => setConfirming(null),
      },
    )
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  const rangeStart = data ? (data.page - 1) * data.page_size + 1 : 0
  const rangeEnd = data ? Math.min(data.page * data.page_size, data.total) : 0
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1
  const rows = data?.items ?? []
  const noun = adminsOnly ? 'admin' : 'user'

  const columns: TableColumn<AdminUserItem>[] = [
    {
      id: 'user',
      header: 'User',
      primary: true,
      cell: (user) => (
        <span className="admin-wrap">
          {user.email}
          {user.full_name ? <span className="admin-subline">{user.full_name}</span> : null}
          {roleAudit(user) ? <span className="admin-subline">{roleAudit(user)}</span> : null}
        </span>
      ),
    },
    {
      id: 'role',
      header: 'Role',
      width: '7rem',
      cell: (user) => <Badge tone={user.is_admin ? 'accent' : 'neutral'}>{user.is_admin ? 'Admin' : 'Member'}</Badge>,
    },
    { id: 'runs', header: 'Runs', numeric: true, width: '4.5rem', cell: (user) => user.run_count },
    {
      id: 'created',
      // The same inset as the dates under it, so the heading sits over its column.
      header: <span className="admin-after-number">Created</span>,
      stackLabel: 'Created',
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
        // The server refuses a change to your own role: no button to press, and a word that says why.
        if (user.id === currentUserId) return <span className="admin-muted">This is you</span>
        const pending = toggleAdmin.isPending && toggleAdmin.variables?.userId === user.id
        return (
          <Button
            size="sm"
            variant="secondary"
            loading={pending}
            disabled={toggleAdmin.isPending}
            onClick={() => {
              toggleAdmin.reset()
              setConfirming(user)
            }}
          >
            {user.is_admin ? 'Remove admin' : 'Make admin'}
          </Button>
        )
      },
    },
  ]

  return (
    <Page>
      <PageHeader
        title="Users"
        meta={countMeta(data ? `${data.total} ${noun}${data.total === 1 ? '' : 's'}` : null, isLoading)}
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

        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-pressed={adminsOnly}
            onClick={() => {
              // The server filters every page: start again at the first.
              setAdminsOnly((on) => !on)
              setPage(1)
            }}
          >
            Admins only
          </Button>
        </div>

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
            density="compact"
            rows={rows}
            getRowId={(user) => user.id}
            loading={isLoading}
            empty={
              adminsOnly && !search ? (
                <EmptyState title="No admins" />
              ) : search ? (
                <EmptyState
                  title={`No ${noun}s match that email`}
                  description={`No email contains "${search}".`}
                  action={
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setSearch('')
                        setSearchInput('')
                        setPage(1)
                      }}
                    >
                      Clear search
                    </Button>
                  }
                />
              ) : (
                <EmptyState title="No users yet" description="People appear here as soon as they create an account." />
              )
            }
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

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        pending={toggleAdmin.isPending}
        tone={confirming?.is_admin ? 'destructive' : 'default'}
        title={confirming ? (confirming.is_admin ? `Remove admin from ${displayName(confirming)}?` : `Make ${displayName(confirming)} an admin?`) : ''}
        description={
          confirming?.is_admin
            ? 'They lose access to every user, run and discovery source in the admin area.'
            : 'They will be able to see every user and run, change other people\'s roles and trip a discovery source\'s kill switch.'
        }
        confirmLabel={confirming?.is_admin ? 'Remove admin' : 'Make admin'}
        onConfirm={confirmRoleChange}
      />
    </Page>
  )
}
