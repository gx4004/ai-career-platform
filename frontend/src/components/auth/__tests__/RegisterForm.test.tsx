import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RegisterForm,
  __resetRegistrationChallengeCache,
} from '#/components/auth/RegisterForm'

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
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

/** The deployment advertisement returned by `GET /auth/providers`. */
function stubAdvertisement(
  body: Record<string, unknown> = {
    providers: [],
    captcha_required: false,
    captcha_provider: null,
  },
) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

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
    __resetRegistrationChallengeCache()
    stubAdvertisement()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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

    expect((await screen.findByRole('alert')).textContent).toContain('72 UTF-8 bytes')
    expect(registerMock).not.toHaveBeenCalled()
  })
})

describe('RegisterForm — registration challenge', () => {
  const CHALLENGE_ADVERTISED = {
    providers: [],
    captcha_required: true,
    captcha_provider: 'recaptcha',
  }

  beforeEach(() => {
    registerMock.mockReset().mockResolvedValue(undefined)
    trackTelemetryMock.mockReset()
    readPendingIntentMock.mockReset().mockReturnValue(null)
    __resetRegistrationChallengeCache()
    delete window.grecaptcha
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    delete window.grecaptcha
  })

  /** The form only asks for a token once the advertisement has been applied. */
  async function waitForAdvertisedChallenge() {
    await screen.findByText('Protected by reCAPTCHA.')
  }

  it('sends the legacy payload with no token when no challenge is advertised', async () => {
    const execute = vi.fn()
    window.grecaptcha = { ready: (cb: () => void) => cb(), execute }
    const fetchMock = stubAdvertisement()

    render(<RegisterForm />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    fillAndSubmit()

    await waitFor(() => expect(registerMock).toHaveBeenCalledTimes(1))
    const payload = registerMock.mock.calls[0][0]
    expect(payload).toEqual({
      email: 'new.user@example.com',
      password: 'sufficiently-long-pass',
      full_name: undefined,
      tos_accepted: true,
    })
    // `toEqual` ignores undefined keys, so pin the exact key set: a
    // `captcha_token` field must not appear at all when the flag is off.
    expect(Object.keys(payload).sort()).toEqual([
      'email',
      'full_name',
      'password',
      'tos_accepted',
    ])
    expect(execute).not.toHaveBeenCalled()
  })

  it('obtains a provider token and submits it when the challenge is advertised', async () => {
    vi.stubEnv('VITE_CAPTCHA_SITE_KEY', 'site-key-123')
    const execute = vi.fn().mockResolvedValue('provider-token')
    window.grecaptcha = { ready: (cb: () => void) => cb(), execute }
    const fetchMock = stubAdvertisement(CHALLENGE_ADVERTISED)

    render(<RegisterForm />)
    await waitForAdvertisedChallenge()
    fillAndSubmit()

    await waitFor(() => expect(registerMock).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0][0]).toContain('/auth/providers')
    expect(execute).toHaveBeenCalledWith('site-key-123', { action: 'register' })
    expect(registerMock.mock.calls[0][0]).toEqual({
      email: 'new.user@example.com',
      password: 'sufficiently-long-pass',
      full_name: undefined,
      tos_accepted: true,
      captcha_token: 'provider-token',
    })
  })

  it('fails closed when the challenge is advertised but no site key is configured', async () => {
    vi.stubEnv('VITE_CAPTCHA_SITE_KEY', '')
    window.grecaptcha = {
      ready: (cb: () => void) => cb(),
      execute: vi.fn().mockResolvedValue('provider-token'),
    }
    stubAdvertisement(CHALLENGE_ADVERTISED)

    render(<RegisterForm />)
    await waitForAdvertisedChallenge()
    fillAndSubmit()

    expect((await screen.findByRole('alert')).textContent).toContain(
      'verification challenge',
    )
    expect(registerMock).not.toHaveBeenCalled()
  })

  it('fails closed when the provider cannot produce a token', async () => {
    vi.stubEnv('VITE_CAPTCHA_SITE_KEY', 'site-key-123')
    window.grecaptcha = {
      ready: (cb: () => void) => cb(),
      execute: vi.fn().mockRejectedValue(new Error('provider outage')),
    }
    stubAdvertisement(CHALLENGE_ADVERTISED)

    render(<RegisterForm />)
    await waitForAdvertisedChallenge()
    fillAndSubmit()

    expect((await screen.findByRole('alert')).textContent).toContain(
      'verification challenge',
    )
    expect(registerMock).not.toHaveBeenCalled()
  })

  it('registers without a token when the advertisement is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    render(<RegisterForm />)
    fillAndSubmit()

    await waitFor(() => expect(registerMock).toHaveBeenCalledTimes(1))
    expect(Object.keys(registerMock.mock.calls[0][0])).not.toContain('captcha_token')
  })

  it('never waits on an unresolved advertisement before registering', async () => {
    // The advertisement request that never settles is the regression: a signup
    // must not be delayed or blocked by it. Nothing resolves this promise, so a
    // submit path that awaits the advertisement can never call register.
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))

    render(<RegisterForm />)
    fillAndSubmit()

    await waitFor(() => expect(registerMock).toHaveBeenCalledTimes(1))
    expect(registerMock.mock.calls[0][0]).toEqual({
      email: 'new.user@example.com',
      password: 'sufficiently-long-pass',
      full_name: undefined,
      tos_accepted: true,
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('fetches the advertisement once per page load across remounts', async () => {
    const fetchMock = stubAdvertisement()

    const first = render(<RegisterForm />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    first.unmount()
    render(<RegisterForm />)

    await waitFor(() => expect(registerMock).toHaveBeenCalledTimes(0))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
