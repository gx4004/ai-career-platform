import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminUsersPage } from '#/pages/admin/admin-users-page'

const getAdminUsersMock = vi.hoisted(() => vi.fn())
const setAdminStatusMock = vi.hoisted(() => vi.fn())

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

function renderPage(items: unknown[], total = items.length) {
  getAdminUsersMock.mockResolvedValue({ items, total, page: 1, page_size: 20 })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AdminUsersPage />
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

  it('badges only the admins; members are plain text', async () => {
    renderPage([user('u-1'), user('u-2', { is_admin: true })])
    await screen.findByText('u-1@example.com')
    expect(screen.getAllByText('Admin')).toHaveLength(1)
    expect(screen.getByText('Member')).toBeTruthy()
  })

  it('promotes another user', async () => {
    renderPage([user('u-1')])
    fireEvent.click(await screen.findByRole('button', { name: 'Make admin' }))
    await waitFor(() => expect(setAdminStatusMock).toHaveBeenCalledWith('u-1', true))
  })

  it('says so when a role change is refused, as the server does for your own account', async () => {
    setAdminStatusMock.mockRejectedValue(new Error('400'))
    renderPage([user('me', { is_admin: true })])
    fireEvent.click(await screen.findByRole('button', { name: 'Remove admin' }))
    expect(await screen.findByText('That role change could not be saved.')).toBeTruthy()
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
        <AdminUsersPage />
      </QueryClientProvider>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(getAdminUsersMock).toHaveBeenCalledTimes(2))
  })
})
