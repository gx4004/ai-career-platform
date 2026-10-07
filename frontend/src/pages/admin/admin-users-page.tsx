import { useRef, useState } from 'react'
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Search, Users } from 'lucide-react'
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
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
import { describeFailure } from '#/lib/api/errors'
import { adminDate } from './toolLabel'
import { breakableEmail } from './breakable-email'
import { countMeta } from './count-meta'
import { AdminLoadError } from './admin-load-error'

/** Who is signed in, from the session (subscribed), so the page can keep an admin from changing their own role. */
function useCurrentUserId() {
  return useSession().user?.id ?? null
}

const displayName = (user: AdminUserItem) => user.full_name || user.email

/**
 * Names are not unique (several accounts can be "Dana Reyes"), so a role change titled by a name also says the
 * account's email: it is the subject of the dialog's sentence and the toast's second line (AAG-F05). With no name
 * the title already is the email.
 */
const roleSubject = (user: AdminUserItem) => (user.full_name ? breakableEmail(user.email) : 'They')

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
  const list = useRef<HTMLDivElement>(null)

  const { data, isLoading, isError, isFetching, refetch } = useQuery<AdminUserListResponse>({
    queryKey: ['admin-users', page, search, adminsOnly],
    queryFn: () =>
      getAdminUsers({ page, page_size: 20, q: search || undefined, ...(adminsOnly ? { is_admin: true } : {}) }),
    staleTime: 30_000,
    // The rows and the pager stay while the next page loads: the Next button keeps focus and the page keeps its height.
    placeholderData: keepPreviousData,
  })

  const toggleAdmin = useMutation({
    mutationFn: ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) =>
      setAdminStatus(userId, isAdmin),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
    // A toast, where the admin is looking: a notice at the top of the list is off-screen from a lower row (AAG-F03).
    onError: (error) => {
      toast({
        tone: 'danger',
        title: 'That role change was not saved',
        description: describeFailure(error, 'Nothing was changed. Try again in a moment.').message,
      })
    },
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
            description: user.full_name ? user.email : undefined,
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
          {breakableEmail(user.email)}
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
      // Stacked on a phone, the button goes under the row so the email keeps the full width.
      stackActions: 'below',
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
            onClick={() => setConfirming(user)}
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
        {/* Next/Previous bring this back into view (Pagination scrollTarget): the search and filter with the rows under
            them, so no sliver of the search is left half-hidden under a phone's app bar (account-admin-AA-F14). */}
        <Stack gap={3} ref={list} className="admin-paged">
          <form role="search" onSubmit={handleSearch}>
            <Toolbar
              search={
                <Input
                  type="search"
                  aria-label="Search users by email"
                  leading={<Search aria-hidden />}
                  placeholder="Search email"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  // The submit sits inside the field, so the role filter can share the row with it (on a phone, the
                  // field and the Filters button), instead of a separate Search button pushing something onto a row of its own.
                  trailing={
                    <Button type="submit" iconOnly size="sm" variant="ghost" aria-label="Search">
                      <ArrowRight aria-hidden />
                    </Button>
                  }
                />
              }
              // The role filter sits with the search (on phones, in the Filters sheet), not on a row of its own.
              filters={
                <Button
                  type="button"
                  variant="secondary"
                  aria-pressed={adminsOnly}
                  onClick={() => {
                    // The server filters every page: start again at the first.
                    setAdminsOnly((on) => !on)
                    setPage(1)
                  }}
                >
                  Admins only
                </Button>
              }
              activeFilters={adminsOnly ? 1 : 0}
            />
          </form>

          {isError ? (
            <AdminLoadError what="users" onRetry={() => void refetch()} retrying={isFetching} />
          ) : (
            <Table
              caption="Users"
              columns={columns}
              density="compact"
              // Five columns, four of them fixed (about 30rem): under 52rem (a tablet) the User column would shrink until
              // every email broke at each hyphen, so the rows stack and the email gets the full width.
              stackBelow={52}
              rows={rows}
              getRowId={(user) => user.id}
              loading={isLoading}
              // A run (and a user) is a name over a sub-line: two-line placeholders keep the rows from growing on load.
              loadingLines={2}
              empty={
                adminsOnly && !search ? (
                  <EmptyState icon={<Users />} title="No admins" />
                ) : search ? (
                  <EmptyState
                    icon={<Search />}
                    title={`No ${noun}s match that email`}
                    description={`No email contains "${search}".`}
                    action={
                      <Button
                        variant="secondary"
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
                  <EmptyState icon={<Users />} title="No users yet" description="People appear here as soon as they create an account." />
                )
              }
            />
          )}
        </Stack>

        <Pagination
          variant="simple"
          aria-label="Users pages"
          page={page}
          pageCount={pageCount}
          onPageChange={setPage}
          scrollTarget={list}
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
          confirming ? (
            confirming.is_admin ? (
              <>{roleSubject(confirming)} will lose access to every user, run and discovery source in the admin area.</>
            ) : (
              <>
                {roleSubject(confirming)} will be able to see every user and run, change other people&apos;s roles and trip a
                discovery source&apos;s kill switch.
              </>
            )
          ) : null
        }
        confirmLabel={confirming?.is_admin ? 'Remove admin' : 'Make admin'}
        onConfirm={confirmRoleChange}
      />
    </Page>
  )
}
