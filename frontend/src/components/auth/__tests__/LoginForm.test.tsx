import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginForm } from '#/components/auth/LoginForm'

const loginMock = vi.hoisted(() => vi.fn())
const googleLoginMock = vi.hoisted(() => vi.fn())
const requestPasswordResetMock = vi.hoisted(() => vi.fn())
const session = vi.hoisted(() => ({ authError: '' }))

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({ login: loginMock, googleLogin: googleLoginMock, authError: session.authError }),
}))
vi.mock('#/lib/api/client', () => ({ requestPasswordReset: requestPasswordResetMock }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

describe('LoginForm', () => {
  beforeEach(() => {
    loginMock.mockReset().mockResolvedValue(undefined)
    googleLoginMock.mockReset()
    requestPasswordResetMock.mockReset().mockResolvedValue({ message: 'A reset link is on its way.' })
    session.authError = ''
  })

  it('keeps the form ids the other flows sign in through', () => {
    render(<LoginForm />)
    expect(document.getElementById('login-email')).toBeTruthy()
    expect(document.getElementById('login-password')).toBeTruthy()
  })

  it('offers Google as a secondary choice and the form submit as the one primary button', () => {
    render(<LoginForm />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }))
    expect(googleLoginMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Sign in with Google' }).className).toContain('kit-button--secondary')
    expect(screen.getByRole('button', { name: 'Sign in' }).className).toContain('kit-button--primary')
  })

  it('submits the typed credentials and reports success', async () => {
    const onSuccess = vi.fn()
    render(<LoginForm onSuccess={onSuccess} />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(loginMock).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'correct horse' }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })

  it('shows and hides the password without submitting the form', () => {
    render(<LoginForm />)
    const password = screen.getByLabelText('Password') as HTMLInputElement
    expect(password.type).toBe('password')
    const toggle = screen.getByRole('button', { name: 'Show password' })
    // The label says what the button does now, so it is not also a pressed-state toggle.
    expect(toggle.hasAttribute('aria-pressed')).toBe(false)
    fireEvent.click(toggle)
    expect(password.type).toBe('text')
    expect(screen.getByRole('button', { name: 'Hide password' }).hasAttribute('aria-pressed')).toBe(false)
    expect(loginMock).not.toHaveBeenCalled()
  })

  it('announces a sign-in error once', () => {
    session.authError = 'Incorrect email or password.'
    render(<LoginForm />)
    expect(screen.getByRole('alert').textContent).toContain('Incorrect email or password.')
  })

  it('walks through a password reset request and back', async () => {
    render(<LoginForm />)
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    await waitFor(() => expect(requestPasswordResetMock).toHaveBeenCalledWith({ email: 'ada@example.com' }))
    expect((await screen.findByRole('status')).textContent).toContain('A reset link is on its way.')
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }))
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
  })

  it('shows a failed reset request', async () => {
    requestPasswordResetMock.mockRejectedValue(new Error('Too many requests.'))
    render(<LoginForm />)
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Too many requests.')
  })
})
