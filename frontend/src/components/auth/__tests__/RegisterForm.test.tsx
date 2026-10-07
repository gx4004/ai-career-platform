import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RegisterForm } from '#/components/auth/RegisterForm'

const registerMock = vi.hoisted(() => vi.fn())
const trackTelemetryMock = vi.hoisted(() => vi.fn())
const readPendingIntentMock = vi.hoisted(() => vi.fn())

vi.mock('#/lib/telemetry/client', () => ({
  trackTelemetry: trackTelemetryMock,
}))

vi.mock('#/lib/auth/pendingIntent', () => ({
  readPendingIntent: readPendingIntentMock,
}))

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({
    register: registerMock,
    googleLogin: vi.fn(),
    authError: '',
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'new.user@example.com' },
  })
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'sufficiently-long-pass' },
  })
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: 'Create free account' }))
}

describe('RegisterForm — auth_signup_source telemetry (D-040)', () => {
  beforeEach(() => {
    registerMock.mockReset().mockResolvedValue(undefined)
    trackTelemetryMock.mockReset()
    readPendingIntentMock.mockReset().mockReturnValue(null)
  })

  it('submits the registration payload', async () => {
    render(<RegisterForm />)
    fillAndSubmit()

    await waitFor(() => expect(registerMock).toHaveBeenCalledTimes(1))
    expect(registerMock.mock.calls[0][0]).toEqual({
      email: 'new.user@example.com',
      password: 'sufficiently-long-pass',
      full_name: undefined,
      tos_accepted: true,
    })
  })

  it('fires auth_signup_source exactly once on successful signup, direct registration carries no tool surface', async () => {
    render(<RegisterForm />)
    fillAndSubmit()

    await waitFor(() => expect(registerMock).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(trackTelemetryMock).toHaveBeenCalledWith({
        event_name: 'auth_signup_source',
        tool_id: undefined,
      }),
    )
    expect(
      trackTelemetryMock.mock.calls.filter(
        (call) => call[0]?.event_name === 'auth_signup_source',
      ),
    ).toHaveLength(1)
  })

  it('attributes the originating surface tool from the pending intent route', async () => {
    readPendingIntentMock.mockReturnValue({
      to: '/resume',
      reason: 'save-demo-result',
      toolId: 'resume',
      createdAt: Date.now(),
    })

    render(<RegisterForm />)
    fillAndSubmit()

    await waitFor(() =>
      expect(trackTelemetryMock).toHaveBeenCalledWith({
        event_name: 'auth_signup_source',
        tool_id: 'resume',
      }),
    )
  })

  it('does not fire when signup fails', async () => {
    registerMock.mockRejectedValue(new Error('email already registered'))

    render(<RegisterForm />)
    fillAndSubmit()

    await waitFor(() => expect(registerMock).toHaveBeenCalledTimes(1))
    expect(
      trackTelemetryMock.mock.calls.filter(
        (call) => call[0]?.event_name === 'auth_signup_source',
      ),
    ).toHaveLength(0)
  })

  it('rejects a new password over the bcrypt UTF-8 byte limit before submission', async () => {
    render(<RegisterForm />)
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'new.user@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: '🔒'.repeat(19) },
    })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Create free account' }))

    // Said without bcrypt jargon, as a sentence (sign-off public-G02).
    expect((await screen.findByRole('alert')).textContent).toBe('Use at most 72 characters (fewer with accents or emoji).')
    expect(registerMock).not.toHaveBeenCalled()
  })

  it('keeps the form ids the other flows register through', () => {
    render(<RegisterForm />)
    for (const id of ['register-name', 'register-email', 'register-password', 'register-tos']) {
      expect(document.getElementById(id), id).toBeTruthy()
    }
  })

  it('marks the name optional and explains the password rule until it is broken', () => {
    render(<RegisterForm />)
    expect(screen.getByText('Optional')).toBeTruthy()
    expect(screen.getByText('At least 8 characters.')).toBeTruthy()
  })

  it('explains an empty email and a short password under their fields instead of the browser bubble', async () => {
    render(<RegisterForm />)
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Create free account' }))
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.map((alert) => alert.textContent)).toEqual(['Enter your email.', 'Use at least 8 characters.'])
    expect(document.activeElement).toBe(screen.getByLabelText('Email'))
    expect(registerMock).not.toHaveBeenCalled()
  })

  // A full name over the server's 200 characters failed silently: the field had no error slot and the notice
  // skipped every field failure (sign-off public-G01).
  it('caps the full name at the 200 characters the server accepts', () => {
    render(<RegisterForm />)
    expect(screen.getByLabelText(/Full name/).getAttribute('maxlength')).toBe('200')
  })

  it('shows a full name the server refuses under its field and moves focus there', async () => {
    const { ApiError } = await import('#/lib/api/errors')
    registerMock.mockRejectedValue(new ApiError('Full name: Use at most 200 characters.', 422, undefined, { fields: { full_name: 'Use at most 200 characters.' } }))
    render(<RegisterForm />)
    fillAndSubmit()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Use at most 200 characters.')
    const name = screen.getByLabelText(/Full name/)
    expect(name.getAttribute('aria-invalid')).toBe('true')
    await waitFor(() => expect(document.activeElement).toBe(name))
  })

  it('says a refusal of a field the form does not show, instead of nothing', async () => {
    const { ApiError } = await import('#/lib/api/errors')
    registerMock.mockRejectedValue(
      new ApiError('Tos accepted: You must accept the Terms of Service.', 422, undefined, { fields: { tos_accepted: 'You must accept the Terms of Service.' } }),
    )
    render(<RegisterForm />)
    fillAndSubmit()
    expect((await screen.findByRole('alert')).textContent).toBe('Tos accepted: You must accept the Terms of Service.')
  })

  // Centring the rate-limit notice moved a page that already showed it and clipped the header (public-G06):
  // it is only brought into view when it is not.
  it('takes the rate-limit notice into view only as far as needed', async () => {
    const { ApiError } = await import('#/lib/api/errors')
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    try {
      registerMock.mockRejectedValue(new ApiError('Too many attempts. Try again in 30 s.', 429, undefined, { retryAfter: 30 }))
      render(<RegisterForm />)
      fillAndSubmit()
      const notice = (await screen.findByText('Slow down')).closest('.kit-notice')!
      expect(document.activeElement).toBe(notice)
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    }
  })

  it('offers sign in or a reset when the email already has an account', async () => {
    registerMock.mockRejectedValue(Object.assign(new Error('Email already registered'), { status: 409 }))
    const onExistingAccount = vi.fn()
    render(<RegisterForm onExistingAccount={onExistingAccount} />)
    fillAndSubmit()
    expect(await screen.findByText('An account already exists for this email.')).toBeTruthy()
    // The way forward can sit below the fold (sign-off public-G07): focus moves to it, which also scrolls it in.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Sign in instead' })))
    fireEvent.click(screen.getByRole('button', { name: 'Sign in instead' }))
    expect(onExistingAccount).toHaveBeenCalledWith('new.user@example.com', 'login')
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))
    expect(onExistingAccount).toHaveBeenCalledWith('new.user@example.com', 'reset')
  })

  // The submit used to stay disabled until the box was ticked, with nothing saying why (sign-off public-F12):
  // it is now always pressable and says what is missing under the checkbox.
  it('explains under the checkbox that the terms are needed, instead of a silent disabled button', async () => {
    render(<RegisterForm />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new.user@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'sufficiently-long-pass' } })
    const submit = screen.getByRole('button', { name: 'Create free account' }) as HTMLButtonElement
    expect(submit.disabled).toBe(false)
    fireEvent.click(submit)
    expect((await screen.findByRole('alert')).textContent).toBe('Agree to the Terms and Privacy Policy to continue.')
    const box = screen.getByRole('checkbox')
    expect(document.activeElement).toBe(box)
    expect(box.getAttribute('aria-invalid')).toBe('true')
    expect(registerMock).not.toHaveBeenCalled()
    fireEvent.click(box)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('reports the fields in form order: the email first, the terms last', async () => {
    render(<RegisterForm />)
    fireEvent.click(screen.getByRole('button', { name: 'Create free account' }))
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.map((alert) => alert.textContent)).toEqual([
      'Enter your email.',
      'Choose a password.',
      'Agree to the Terms and Privacy Policy to continue.',
    ])
    expect(document.activeElement).toBe(screen.getByLabelText('Email'))
  })

  it('opens the terms and the privacy policy in a new tab, so the form keeps what was typed', () => {
    render(<RegisterForm />)
    for (const [name, href] of [
      ['Terms of Service', '/terms'],
      ['Privacy Policy', '/privacy'],
    ]) {
      const link = screen.getByRole('link', { name })
      expect(link.getAttribute('href')).toBe(href)
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toContain('noopener')
    }
  })
})
