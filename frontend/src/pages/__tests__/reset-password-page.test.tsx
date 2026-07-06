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

vi.mock('#/lib/api/client', () => ({
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
})
