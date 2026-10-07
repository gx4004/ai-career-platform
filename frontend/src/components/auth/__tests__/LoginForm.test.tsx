import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { fireEvent, render as baseRender, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginForm } from '#/components/auth/LoginForm'

const loginMock = vi.hoisted(() => vi.fn())
const googleLoginMock = vi.hoisted(() => vi.fn())
const requestPasswordResetMock = vi.hoisted(() => vi.fn())
const getAuthProvidersMock = vi.hoisted(() => vi.fn())
const session = vi.hoisted(() => ({ authError: '' }))
// authError stays on the mock: the forms read their own failures, not the session's shared string.

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({ login: loginMock, googleLogin: googleLoginMock, authError: session.authError }),
}))
vi.mock('#/lib/api/client', () => ({ requestPasswordReset: requestPasswordResetMock, getAuthProviders: getAuthProvidersMock }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

function render(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return baseRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('LoginForm', () => {
  beforeEach(() => {
    getAuthProvidersMock.mockReset().mockResolvedValue({ providers: ['google'] })
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

  it('offers Google as a secondary choice and the form submit as the one primary button', async () => {
    render(<LoginForm />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Google' }))
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

  it('announces a sign-in error once', async () => {
    loginMock.mockRejectedValue(new Error('Incorrect email or password.'))
    render(<LoginForm />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Incorrect email or password.')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('shows a mistyped email next to its field, not as a second notice', async () => {
    const { z } = await import('zod')
    loginMock.mockRejectedValue(z.object({ email: z.email() }).safeParse({ email: 'x' }).error)
    render(<LoginForm />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Enter a valid email address.')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('explains empty and malformed fields under them instead of the browser bubble', async () => {
    render(<LoginForm />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.map((alert) => alert.textContent)).toEqual(['Enter your email.', 'Enter your password.'])
    expect(document.activeElement).toBe(screen.getByLabelText('Email'))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect((await screen.findAllByRole('alert'))[0].textContent).toBe('Enter an email like you@example.com.')
    expect(loginMock).not.toHaveBeenCalled()
  })

  it('opens on the reset step with the email filled in when asked to', async () => {
    const onResetChange = vi.fn()
    render(<LoginForm initialEmail="ada@example.com" startInReset onResetChange={onResetChange} />)
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('ada@example.com')
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeTruthy()
    expect(onResetChange).toHaveBeenCalledWith(true)
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

  it('shows no Google button unless the server lists google as a provider', async () => {
    getAuthProvidersMock.mockResolvedValue({ providers: [] })
    render(<LoginForm />)
    await waitFor(() => expect(getAuthProvidersMock).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).toBeNull()
    expect(screen.queryByText('or continue with email')).toBeNull()
  })

  it('shows no Google button when the providers request fails', async () => {
    getAuthProvidersMock.mockRejectedValue(new Error('down'))
    render(<LoginForm />)
    await waitFor(() => expect(getAuthProvidersMock).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).toBeNull()
  })

  it('says how long to wait after a rate limit and holds the submit until then', async () => {
    const limited = Object.assign(new Error('Rate limit exceeded: 5 per 1 minute'), { status: 429, detail: 'Rate limit exceeded: 5 per 1 minute' })
    loginMock.mockRejectedValue(limited)
    render(<LoginForm />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Too many attempts')
    expect(screen.getByTestId('retry-countdown').textContent).toBe('Try again in 60\u00a0s.')
    expect((screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('moves focus to the rate-limit notice, so a keyboard user does not drop to the page body', async () => {
    const limited = Object.assign(new Error('Rate limit exceeded: 5 per 1 minute'), { status: 429, detail: 'Rate limit exceeded: 5 per 1 minute' })
    loginMock.mockRejectedValue(limited)
    render(<LoginForm />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse' } })
    const submit = screen.getByRole('button', { name: 'Sign in' })
    submit.focus()
    fireEvent.click(submit)
    const alert = await screen.findByRole('alert')
    await waitFor(() => expect(document.activeElement).toBe(alert))
  })

  it('offers the reset link itself when the server hands one back in development', async () => {
    requestPasswordResetMock.mockResolvedValue({
      message: 'A reset link is on its way.',
      dev_reset_url: `${window.location.origin}/reset-password#token=abc`,
    })
    render(<LoginForm />)
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    const link = await screen.findByRole('link', { name: 'Open reset link' })
    expect(link.getAttribute('href')).toBe('/reset-password#token=abc')
  })

  it('carries the email typed into sign in over to the reset step', () => {
    render(<LoginForm />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('ada@example.com')
  })

  it('drops an earlier failed sign-in once the visitor has asked for a reset', async () => {
    loginMock.mockRejectedValue(new Error('Invalid email or password'))
    render(<LoginForm />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Invalid email or password')
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    await screen.findByRole('status')
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('ada@example.com')
  })

  it('keeps keyboard focus in the form when a step replaces the button that was pressed', async () => {
    render(<LoginForm />)
    // Forgot password? unmounts with the sign-in form: focus goes to the field the visitor fills next.
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    expect(document.activeElement).toBe(screen.getByLabelText('Email'))
    expect(document.activeElement?.id).toBe('reset-email')
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    await screen.findByRole('status')
    // The send button gave way to the confirmation: the way back is the next thing to press.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Back to sign in' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }))
    // Back on sign in with the email kept, so the password is next.
    expect(document.activeElement).toBe(screen.getByLabelText('Password'))
  })

  it('does not take focus from where it already is', () => {
    render(
      <>
        <button type="button">Elsewhere</button>
        <LoginForm />
      </>,
    )
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' })
    elsewhere.focus()
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    expect(document.activeElement).toBe(elsewhere)
  })

  it('takes focus to the password after a handoff that fills the email in, but not on a plain page load', () => {
    const { unmount } = render(<LoginForm />)
    expect(document.activeElement).toBe(document.body)
    unmount()
    render(<LoginForm initialEmail="ada@example.com" />)
    expect(document.activeElement).toBe(screen.getByLabelText('Password'))
  })

  it('takes focus to the reset email after a handoff that opens on the reset step', () => {
    render(<LoginForm initialEmail="ada@example.com" startInReset />)
    expect(document.activeElement?.id).toBe('reset-email')
  })

  it('never offers a reset link that leaves this site', async () => {
    requestPasswordResetMock.mockResolvedValue({ message: 'ok', dev_reset_url: 'https://evil.example/reset-password#token=abc' })
    render(<LoginForm />)
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    await screen.findByRole('status')
    expect(screen.queryByRole('link', { name: 'Open reset link' })).toBeNull()
  })
})
