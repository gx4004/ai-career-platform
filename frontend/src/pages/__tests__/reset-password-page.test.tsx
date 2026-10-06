import { StrictMode } from 'react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResetPasswordPage } from '#/pages/reset-password-page'

const routerState = vi.hoisted(() => ({
  legacyToken: undefined as string | undefined,
}))
const confirmPasswordResetMock = vi.hoisted(() =>
  vi.fn(async () => undefined),
)

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children: ReactNode
    to: string
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useSearch: () => ({ token: routerState.legacyToken }),
}))

vi.mock('#/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/api/client')>()),
  confirmPasswordReset: confirmPasswordResetMock,
}))

describe('ResetPasswordPage reset-link privacy', () => {
  beforeEach(() => {
    routerState.legacyToken = undefined
    confirmPasswordResetMock.mockClear()
    window.history.replaceState({}, '', '/reset-password')
  })

  it('consumes a fragment token, scrubs it, and submits it in the request body', async () => {
    window.history.replaceState({}, '', '/reset-password#token=fragment-token')

    render(<ResetPasswordPage />)

    expect(screen.getByRole('heading', { name: 'Set a new password' })).toBeTruthy()
    expect(window.location.pathname).toBe('/reset-password')
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe('')

    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'new-password' },
    })
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'new-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))

    await waitFor(() => {
      expect(confirmPasswordResetMock).toHaveBeenCalledWith({
        token: 'fragment-token',
        new_password: 'new-password',
      })
    })
  })

  it('accepts and scrubs legacy query-token links during rollout', () => {
    routerState.legacyToken = 'legacy-token'
    window.history.replaceState({}, '', '/reset-password?token=legacy-token')

    render(<ResetPasswordPage />)

    expect(screen.getByRole('heading', { name: 'Set a new password' })).toBeTruthy()
    expect(window.location.pathname).toBe('/reset-password')
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe('')
  })

  it('rejects a reset password over the bcrypt UTF-8 byte limit before submission', async () => {
    window.history.replaceState({}, '', '/reset-password#token=fragment-token')
    render(<ResetPasswordPage />)

    const oversized = '🔒'.repeat(19)
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: oversized },
    })
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: oversized },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))

    expect((await screen.findByRole('alert')).textContent).toContain('72 UTF-8 bytes')
    expect(confirmPasswordResetMock).not.toHaveBeenCalled()
  })
})

describe('ResetPasswordPage states', () => {
  beforeEach(() => {
    routerState.legacyToken = undefined
    window.history.replaceState({}, '', '/reset-password')
  })

  it('explains a missing link and offers the way back as the one action', () => {
    render(<ResetPasswordPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Invalid reset link' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to sign in' }).getAttribute('href')).toBe('/login')
    expect(screen.getByRole('link', { name: 'Career Workbench home' }).getAttribute('href')).toBe('/')
  })

  it('shows the form under the brand, with a way back and the password toggle', () => {
    window.history.replaceState({}, '', '/reset-password#token=fragment-token')
    render(<ResetPasswordPage />)
    expect(screen.getByRole('link', { name: 'Career Workbench home' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Back to sign in/ }).getAttribute('href')).toBe('/login')
    const toggle = screen.getByRole('button', { name: 'Show password' })
    fireEvent.click(toggle)
    expect((screen.getByLabelText('New password') as HTMLInputElement).type).toBe('text')
    expect((screen.getByLabelText('Confirm password') as HTMLInputElement).type).toBe('text')
  })

  it('rejects mismatched passwords without calling the API', async () => {
    window.history.replaceState({}, '', '/reset-password#token=fragment-token')
    confirmPasswordResetMock.mockClear()
    render(<ResetPasswordPage />)
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-password-1' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'new-password-2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Passwords do not match.')
    expect(confirmPasswordResetMock).not.toHaveBeenCalled()
  })

  it('confirms the new password and points to sign in', async () => {
    window.history.replaceState({}, '', '/reset-password#token=fragment-token')
    render(<ResetPasswordPage />)
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-password-1' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'new-password-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Password updated' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login')
  })

  it('turns a token the server rejects into the invalid-link state, with the way back to request a new one', async () => {
    const { ApiError } = await import('#/lib/api/errors')
    confirmPasswordResetMock.mockRejectedValueOnce(new ApiError('Invalid or expired reset token', 400, 'Invalid or expired reset token') as never)
    window.history.replaceState({}, '', '/reset-password#token=old-token')
    render(<ResetPasswordPage />)
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-password-1' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'new-password-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Invalid reset link' })).toBeTruthy()
    expect(screen.getByText(/expired or was already used/)).toBeTruthy()
    expect(screen.getByText(/Forgot password\?/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to sign in' }).getAttribute('href')).toBe('/login')
  })

  it('keeps the token it consumed when effects run twice (dev strict mode)', () => {
    window.history.replaceState({}, '', '/reset-password#token=fragment-token')
    render(
      <StrictMode>
        <ResetPasswordPage />
      </StrictMode>,
    )
    // The fragment was scrubbed by the first pass; the second must not lose the link.
    expect(screen.getByRole('heading', { name: 'Set a new password' })).toBeTruthy()
    expect(window.location.hash).toBe('')
  })
})
