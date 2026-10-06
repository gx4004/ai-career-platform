import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '#/components/kit'
import { ApiError } from '#/lib/api/errors'
import { CURRENT_USER_QUERY_KEY } from '#/lib/auth/currentUser'
import { AccountPage } from '#/pages/account-page'

const session = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
const resetMock = vi.hoisted(() => vi.fn())
const updateMeMock = vi.hoisted(() => vi.fn())
const changePasswordMock = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/api/client')>()),
  requestPasswordReset: resetMock,
  updateMe: updateMeMock,
  changePassword: changePasswordMock,
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('#/hooks/useSession', () => ({ useSession: () => session.value }))
vi.mock('#/components/applications/ApplicationDetailsCard', () => ({
  ApplicationDetailsCard: () => <div>details card</div>,
}))

function renderPage(overrides: Record<string, unknown>, client = new QueryClient()) {
  session.value = {
    status: 'authenticated',
    user: { email: 'ada@example.com', full_name: 'Ada Lovelace', created_at: '2026-01-05T00:00:00Z' },
    providers: [],
    logout: vi.fn(),
    openAuthDialog: vi.fn(),
    ...overrides,
  }
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AccountPage />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('Account page', () => {
  it('titles the page Account, with the name and email in the Identity panel and a member-since sticker', () => {
    renderPage({})
    expect(screen.getByRole('heading', { level: 1, name: 'Account' })).toBeTruthy()
    const identity = within(screen.getByRole('region', { name: 'Identity' }))
    expect(identity.getByText('Ada Lovelace')).toBeTruthy()
    expect(identity.getByText('ada@example.com')).toBeTruthy()
    expect(identity.getByText(/^Member since /)).toBeTruthy()
  })

  it('omits the member-since chip when the date is missing', () => {
    renderPage({ user: { email: 'ada@example.com', full_name: null, created_at: null } })
    expect(screen.queryByText(/Member since/)).toBeNull()
    expect(screen.queryByText('Unavailable')).toBeNull()
  })

  it('hides the sign-in options card unless Google sign-in is enabled', () => {
    renderPage({ providers: [{ provider: 'google', label: 'Google', enabled: false }] })
    expect(screen.queryByText('Sign-in options')).toBeNull()
  })

  it('shows neutral copy when Google sign-in is enabled', () => {
    renderPage({ providers: [{ provider: 'google', label: 'Google', enabled: true }] })
    expect(screen.getByText('Sign-in options')).toBeTruthy()
    expect(screen.getByText('Google sign-in is available.')).toBeTruthy()
  })

  it('keeps the page header for a signed-out visitor, with the sign-in prompt under it', () => {
    renderPage({ status: 'guest', user: null })
    expect(screen.getByRole('heading', { level: 1, name: 'Account' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Your workspace, your way' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
    expect(screen.queryByText('details card')).toBeNull()
  })

  it.each(['loading', 'unreachable'])('holds a placeholder, not the sign-in prompt, while the session is %s', (status) => {
    renderPage({ status, user: null })
    expect(screen.getByRole('heading', { level: 1, name: 'Account' })).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Loading your account' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull()
  })

  it('shows the member-since date with its year', () => {
    renderPage({})
    expect(screen.getByText(/^Member since .*2026$/)).toBeTruthy()
  })

  it('keeps "Forgot it? Email me a link" as a quiet link that emails the account address', async () => {
    resetMock.mockResolvedValue({ message: 'ok' })
    renderPage({})
    fireEvent.click(screen.getByRole('button', { name: 'Forgot it? Email me a link' }))
    await waitFor(() => expect(resetMock).toHaveBeenCalledWith({ email: 'ada@example.com' }))
    expect(await screen.findByText(/is on its way to ada@example.com/)).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'open the reset link' })).toBeNull()
  })

  it('offers the emailed link itself only when local development hands it back', async () => {
    resetMock.mockResolvedValue({ message: 'ok', dev_reset_url: 'http://localhost:3000/reset-password#token=t' })
    renderPage({})
    fireEvent.click(screen.getByRole('button', { name: 'Forgot it? Email me a link' }))
    const link = await screen.findByRole('link', { name: 'open the reset link' })
    expect(link.getAttribute('href')).toBe('http://localhost:3000/reset-password#token=t')
  })

  it('edits the name and puts the saved user in the session cache, so the sidebar follows without a reload', async () => {
    const saved = { id: 'u1', email: 'ada@example.com', full_name: 'Ada King', is_active: true }
    updateMeMock.mockResolvedValue(saved)
    const client = new QueryClient()
    renderPage({}, client)
    fireEvent.click(screen.getByRole('button', { name: 'Edit name' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Edit your name' }))
    fireEvent.change(dialog.getByLabelText('Name'), { target: { value: '  Ada King ' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Save name' }))
    await waitFor(() => expect(updateMeMock).toHaveBeenCalledWith({ full_name: 'Ada King' }))
    await waitFor(() => expect(client.getQueryData(CURRENT_USER_QUERY_KEY)).toEqual(saved))
    expect((await screen.findAllByText('Name saved')).length).toBeGreaterThan(0)
  })

  it('clears the name when the field is emptied', async () => {
    updateMeMock.mockResolvedValue({ id: 'u1', email: 'ada@example.com', full_name: null, is_active: true })
    renderPage({})
    fireEvent.click(screen.getByRole('button', { name: 'Edit name' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Edit your name' }))
    fireEvent.change(dialog.getByLabelText('Name'), { target: { value: '   ' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Save name' }))
    await waitFor(() => expect(updateMeMock).toHaveBeenCalledWith({ full_name: null }))
  })

  async function openPasswordDialog() {
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    return within(await screen.findByRole('dialog', { name: 'Change password' }))
  }

  function fillPasswords(dialog: ReturnType<typeof within>, current: string, next: string, confirm = next) {
    fireEvent.change(dialog.getByLabelText('Current password'), { target: { value: current } })
    fireEvent.change(dialog.getByLabelText('New password'), { target: { value: next } })
    fireEvent.change(dialog.getByLabelText('Confirm new password'), { target: { value: confirm } })
    fireEvent.click(dialog.getByRole('button', { name: 'Change password' }))
  }

  it('changes the password in the app and says the other sessions were signed out', async () => {
    changePasswordMock.mockReset().mockResolvedValue(undefined)
    renderPage({})
    fillPasswords(await openPasswordDialog(), 'old-password', 'new-password-1')
    await waitFor(() =>
      expect(changePasswordMock).toHaveBeenCalledWith({ current_password: 'old-password', new_password: 'new-password-1' }),
    )
    expect((await screen.findAllByText('Password changed. Other sessions were signed out.')).length).toBeGreaterThan(0)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('checks the new password before asking the server', async () => {
    changePasswordMock.mockReset()
    renderPage({})
    const dialog = await openPasswordDialog()
    fillPasswords(dialog, 'old-password', 'short')
    expect(await dialog.findByText('Use at least 8 characters.')).toBeTruthy()
    fillPasswords(dialog, 'old-password', 'new-password-1', 'new-password-2')
    expect(await dialog.findByText('Passwords do not match.')).toBeTruthy()
    expect(changePasswordMock).not.toHaveBeenCalled()
  })

  it('puts a wrong current password under its field, in plain words', async () => {
    changePasswordMock.mockReset().mockRejectedValue(new ApiError('Current password is incorrect', 400, 'Current password is incorrect'))
    renderPage({})
    const dialog = await openPasswordDialog()
    fillPasswords(dialog, 'wrong-password', 'new-password-1')
    expect(await dialog.findByText("That isn't your current password. Check it and try again.")).toBeTruthy()
    expect(dialog.getByLabelText('Current password').getAttribute('aria-invalid')).toBe('true')
  })

  it('tells a Google-only account it has no password yet and offers the emailed link', async () => {
    changePasswordMock
      .mockReset()
      .mockRejectedValue(new ApiError('This account has no password yet. Use "Forgot password" to set one.', 400))
    resetMock.mockResolvedValue({ message: 'ok' })
    renderPage({})
    fillPasswords(await openPasswordDialog(), 'anything', 'new-password-1')
    const dialog = within(await screen.findByRole('dialog', { name: 'This account has no password yet' }))
    fireEvent.click(dialog.getByRole('button', { name: 'Email me a link' }))
    await waitFor(() => expect(resetMock).toHaveBeenCalledWith({ email: 'ada@example.com' }))
  })

  it('has a Your data block with the export and both deletions', () => {
    renderPage({})
    const data = within(screen.getByRole('list', { name: 'Your data' }))
    for (const name of ['Export data', 'Delete profile', 'Delete account']) {
      expect(data.getByRole('button', { name })).toBeTruthy()
    }
  })

  it('puts Sign out in a row like the settings rows', () => {
    const logout = vi.fn()
    renderPage({ logout })
    const list = screen.getByRole('list', { name: 'Session' })
    fireEvent.click(within(list).getByRole('button', { name: 'Sign out' }))
    expect(logout).toHaveBeenCalledTimes(1)
  })
})
