import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GuestSaveBanner } from '#/components/tooling/GuestSaveBanner'

const session = vi.hoisted(() => ({ status: 'guest' as string, openAuthDialog: vi.fn() }))

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({ status: session.status, openAuthDialog: session.openAuthDialog }),
}))

describe('GuestSaveBanner', () => {
  beforeEach(() => {
    sessionStorage.clear()
    session.openAuthDialog.mockClear()
  })

  it('tells a known guest that runs are not saved', () => {
    session.status = 'guest'
    render(<GuestSaveBanner toolId="cover-letter" />)
    expect(screen.getByText('Guest runs are not saved.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in to keep your results' })).toBeTruthy()
  })

  it('signs in with a return route to the tool the guest is filling in', () => {
    session.status = 'guest'
    window.history.replaceState(null, '', '/cover-letter?tone=warm')
    render(<GuestSaveBanner toolId="cover-letter" />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to keep your results' }))
    expect(session.openAuthDialog).toHaveBeenCalledWith({
      to: '/cover-letter?tone=warm',
      reason: 'save-demo-result',
      toolId: 'cover-letter',
    })
  })

  it.each(['loading', 'authenticated', 'unreachable'])('says nothing while the session is %s', (status) => {
    session.status = status
    render(<GuestSaveBanner toolId="resume" />)
    expect(screen.queryByText('Guest runs are not saved.')).toBeNull()
  })
})
