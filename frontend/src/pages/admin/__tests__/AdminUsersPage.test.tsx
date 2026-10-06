import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '#/components/kit'
import { AdminUsersPage } from '#/pages/admin/admin-users-page'

const getAdminUsersMock = vi.hoisted(() => vi.fn())
const setAdminStatusMock = vi.hoisted(() => vi.fn())

const session = vi.hoisted(() => ({ user: null as { id: string } | null }))
vi.mock('#/hooks/useSession', () => ({ useSession: () => ({ status: 'authenticated', user: session.user }) }))

vi.mock('#/lib/api/admin', () => ({
  getAdminUsers: getAdminUsersMock,
  setAdminStatus: setAdminStatusMock,
}))

const user = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  email: `${id}@example.com`,
  full_name: null,
  is_active: true,
  is_admin: false,
  created_at: '2026-10-01T00:00:00Z',
  run_count: 3,
  ...overrides,
})

function renderPage(items: unknown[], total = items.length, currentUserId?: string) {
  getAdminUsersMock.mockResolvedValue({ items, total, page: 1, page_size: 20 })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  session.user = currentUserId ? { id: currentUserId } : null
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AdminUsersPage />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('AdminUsersPage', () => {
  beforeEach(() => {
    getAdminUsersMock.mockReset()
    setAdminStatusMock.mockReset().mockResolvedValue({ ok: true, is_admin: true })
  })

  it('lists each user once, with the name under the email and the count in the header', async () => {
    renderPage([user('u-1', { full_name: 'Ada Lovelace' }), user('u-2')])
    expect(await screen.findByText('u-1@example.com')).toBeTruthy()
    expect(screen.getByText('Ada Lovelace')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Users' })).toBeTruthy()
    expect(screen.getByText('2 users')).toBeTruthy()
  })

  it('says who changed a role last and when, from the audit columns (B13)', async () => {
    renderPage([
      user('u-1', { is_admin: true, role_changed_at: '2026-10-06T08:00:00Z', role_changed_by: 'boss@example.com' }),
      user('u-2', { role_changed_at: '2026-10-05T08:00:00Z', role_changed_by: 'boss@example.com' }),
      user('u-3', { role_changed_at: '2026-10-04T08:00:00Z', role_changed_by: null }),
      user('u-4', { role_changed_at: null, role_changed_by: null }),
    ])
    expect(await screen.findByText(/^Made admin by boss@example\.com on /)).toBeTruthy()
    expect(screen.getByText(/^Admin removed by boss@example\.com on /)).toBeTruthy()
    expect(screen.getByText(/^Admin removed on /)).toBeTruthy()
    expect(screen.getAllByText(/^(Made admin|Admin removed)/)).toHaveLength(3)
  })

  it('badges the role of every user: Admin in the accent colour, Member neutral', async () => {
    renderPage([user('u-1'), user('u-2', { is_admin: true })])
    await screen.findByText('u-1@example.com')
    expect(screen.getAllByText('Admin')).toHaveLength(1)
    expect(screen.getByText('Admin').closest('[data-tone]')?.getAttribute('data-tone')).toBe('accent')
    expect(screen.getByText('Member').closest('[data-tone]')?.getAttribute('data-tone')).toBe('neutral')
  })

  it('asks before promoting, and changes nothing when the question is cancelled', async () => {
    renderPage([user('u-1', { full_name: 'Ada Lovelace' })])
    fireEvent.click(await screen.findByRole('button', { name: 'Make admin' }))
    const dialog = within(await screen.findByRole('alertdialog', { name: 'Make Ada Lovelace an admin?' }))
    expect(setAdminStatusMock).not.toHaveBeenCalled()
    fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(setAdminStatusMock).not.toHaveBeenCalled()
  })

  it('promotes another user once the question is confirmed, and says it was done', async () => {
    renderPage([user('u-1')])
    fireEvent.click(await screen.findByRole('button', { name: 'Make admin' }))
    const dialog = within(await screen.findByRole('alertdialog'))
    fireEvent.click(dialog.getByRole('button', { name: 'Make admin' }))
    await waitFor(() => expect(setAdminStatusMock).toHaveBeenCalledWith('u-1', true))
    expect((await screen.findAllByText('u-1@example.com is now an admin')).length).toBeGreaterThan(0)
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })

  it('asks before taking admin away', async () => {
    renderPage([user('u-1', { is_admin: true })])
    fireEvent.click(await screen.findByRole('button', { name: 'Remove admin' }))
    expect(await screen.findByRole('alertdialog', { name: 'Remove admin from u-1@example.com?' })).toBeTruthy()
  })

  it('keeps the role button off your own row', async () => {
    renderPage([user('me', { is_admin: true }), user('u-2')], 2, 'me')
    await screen.findByText('me@example.com')
    expect(screen.getByText('This is you')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /admin/i })).toHaveLength(2) // the other row's button and the filter chip
  })

  it('says so when a role change is refused', async () => {
    setAdminStatusMock.mockRejectedValue(new Error('400'))
    renderPage([user('u-2', { is_admin: true })])
    fireEvent.click(await screen.findByRole('button', { name: 'Remove admin' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove admin' }))
    expect(await screen.findByText('That role change could not be saved.')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })

  it('asks the server for admins only, across every page, from page 1', async () => {
    renderPage([user('u-1'), user('u-2', { is_admin: true })], 45)
    await screen.findByText('u-1@example.com')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(getAdminUsersMock).toHaveBeenLastCalledWith({ page: 2, page_size: 20 }))

    getAdminUsersMock.mockResolvedValue({ items: [user('u-2', { is_admin: true })], total: 3, page: 1, page_size: 20 })
    fireEvent.click(screen.getByRole('button', { name: 'Admins only' }))

    await waitFor(() =>
      expect(getAdminUsersMock).toHaveBeenLastCalledWith({ page: 1, page_size: 20, is_admin: true }),
    )
    expect(screen.getByRole('button', { name: 'Admins only' }).getAttribute('aria-pressed')).toBe('true')
    expect(await screen.findByText('3 admins')).toBeTruthy()
    // Three admins fit on one page: the pager over the 45 users is gone.
    expect(screen.queryByRole('navigation', { name: 'Users pages' })).toBeNull()
    expect(screen.queryByText(/on this page/)).toBeNull()
  })

  it('says there are no admins when the server finds none', async () => {
    renderPage([user('u-1')])
    await screen.findByText('u-1@example.com')
    getAdminUsersMock.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 })
    fireEvent.click(screen.getByRole('button', { name: 'Admins only' }))
    expect(await screen.findByText('No admins')).toBeTruthy()
  })

  it('searches by email on submit', async () => {
    renderPage([user('u-1')])
    await screen.findByText('u-1@example.com')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search users by email' }), { target: { value: 'ada' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() =>
      expect(getAdminUsersMock).toHaveBeenLastCalledWith({ page: 1, page_size: 20, q: 'ada' }),
    )
  })

  it('offers a retry when the list fails to load', async () => {
    getAdminUsersMock.mockRejectedValue(new Error('boom'))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <AdminUsersPage />
        </ToastProvider>
      </QueryClientProvider>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(getAdminUsersMock).toHaveBeenCalledTimes(2))
  })
})
