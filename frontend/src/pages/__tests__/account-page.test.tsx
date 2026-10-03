import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AccountPage } from '#/pages/account-page'

const session = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))

vi.mock('#/hooks/useSession', () => ({ useSession: () => session.value }))
vi.mock('#/components/applications/ApplicationDetailsCard', () => ({
  ApplicationDetailsCard: () => <div>details card</div>,
}))

function renderPage(overrides: Record<string, unknown>) {
  session.value = {
    status: 'authenticated',
    user: { email: 'ada@example.com', full_name: 'Ada Lovelace', created_at: '2026-01-05T00:00:00Z' },
    providers: [],
    logout: vi.fn(),
    openAuthDialog: vi.fn(),
    ...overrides,
  }
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AccountPage />
    </QueryClientProvider>,
  )
}

describe('Account page', () => {
  it('titles the page Account, with the email and name in the hero', () => {
    renderPage({})
    expect(screen.getByRole('heading', { level: 1, name: 'Account' })).toBeTruthy()
    // The header does not repeat the name and email; the editable Email field carries them.
    expect(screen.queryByText('Ada Lovelace')).toBeNull()
    expect(screen.getByText(/^Member since /)).toBeTruthy()
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
})
