import type { ReactNode } from 'react'
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
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
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
})
