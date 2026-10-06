import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GuestSaveBanner } from '#/components/tooling/GuestSaveBanner'

const session = vi.hoisted(() => ({ status: 'guest' as string }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('#/hooks/useSession', () => ({ useSession: () => ({ status: session.status }) }))

describe('GuestSaveBanner', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('tells a known guest that runs are not saved', () => {
    session.status = 'guest'
    render(<GuestSaveBanner />)
    expect(screen.getByText('Guest runs are not saved.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Sign in to keep your results' })).toBeTruthy()
  })

  it.each(['loading', 'authenticated', 'unreachable'])('says nothing while the session is %s', (status) => {
    session.status = status
    render(<GuestSaveBanner />)
    expect(screen.queryByText('Guest runs are not saved.')).toBeNull()
  })
})
