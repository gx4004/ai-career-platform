import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SubmissionAuthorizationsCard } from '#/components/account/SubmissionAuthorizationsCard'

const listSubmissionAuthorizationsMock = vi.hoisted(() => vi.fn())
const revokeSubmissionAuthorizationMock = vi.hoisted(() => vi.fn())
const getSubmissionSafetyStatusMock = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/submissionAuthorizations', () => ({
  listSubmissionAuthorizations: listSubmissionAuthorizationsMock,
  revokeSubmissionAuthorization: revokeSubmissionAuthorizationMock,
  getSubmissionSafetyStatus: getSubmissionSafetyStatusMock,
  submissionAuthorizationQueryKey: (userId: string) => [
    'submission-authorizations',
    userId,
  ],
}))

function renderCard(userId = 'user-a', existingClient?: QueryClient) {
  getSubmissionSafetyStatusMock.mockResolvedValue({
    allowed: false,
    reason: 'global_kill_switch',
    user_rate_used: 0,
    user_rate_limit: 2,
    user_daily_used: 0,
    user_daily_limit: 20,
    source_rate_used: 0,
    source_rate_limit: 10,
    source_daily_used: 0,
    source_daily_limit: 100,
  })
  const client = existingClient ?? new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={client}>
      <SubmissionAuthorizationsCard userId={userId} />
    </QueryClientProvider>,
  )
  return { client, ...view }
}

describe('SubmissionAuthorizationsCard', () => {
  it('shows every active source grant without exposing provider credentials', async () => {
    listSubmissionAuthorizationsMock.mockResolvedValue({
      items: [
        {
          id: 'grant-1',
          source_id: 'source-1',
          source_key: 'synthetic-ats',
          source_display_name: 'Synthetic ATS',
          source_family: 'employer_ats',
          mechanism: 'oauth2_authorization_code',
          scope: 'submit_applications',
          granted_at: '2026-07-25T12:00:00Z',
        },
      ],
    })

    renderCard()

    expect(await screen.findByText('Synthetic ATS')).toBeTruthy()
    expect(screen.getByText('Employer ATS')).toBeTruthy()
    expect(screen.getByText('OAuth 2 authorization code')).toBeTruthy()
    expect(screen.getByText('Submit applications')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Revoke Synthetic ATS' })).toBeTruthy()
    expect(await screen.findByText(/Paused globally by operators/)).toBeTruthy()
    expect(screen.queryByText(/token|password|cookie/i)).toBeNull()
  })

  it('revokes one exact grant and refreshes the active list', async () => {
    listSubmissionAuthorizationsMock
      .mockResolvedValueOnce({
        items: [
          {
            id: 'grant-1',
            source_id: 'source-1',
            source_key: 'synthetic-ats',
            source_display_name: 'Synthetic ATS',
            source_family: 'employer_ats',
            mechanism: 'oauth2_device_authorization',
            scope: 'submit_applications',
            granted_at: '2026-07-25T12:00:00Z',
          },
        ],
      })
      .mockResolvedValueOnce({ items: [] })
    revokeSubmissionAuthorizationMock.mockResolvedValue(undefined)
    renderCard()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Revoke Synthetic ATS' }),
    )

    await waitFor(() =>
      expect(revokeSubmissionAuthorizationMock).toHaveBeenCalledWith('grant-1'),
    )
    expect(
      await screen.findByText(
        'You have not authorized submission for any source.',
      ),
    ).toBeTruthy()
  })

  it('makes empty, loading failure, and revocation failure states explicit', async () => {
    listSubmissionAuthorizationsMock.mockResolvedValueOnce({ items: [] })
    renderCard()
    const empty = await screen.findByText(
        'You have not authorized submission for any source.',
      )
    expect(empty.getAttribute('role')).toBe('status')

    listSubmissionAuthorizationsMock.mockRejectedValueOnce(new Error('offline'))
    renderCard()
    const loadError = await screen.findByText(
      'Active submission authorizations could not be loaded.',
    )
    expect(loadError.getAttribute('role')).toBe('alert')
  })

  it('announces a revocation failure and leaves the grant visible', async () => {
    listSubmissionAuthorizationsMock.mockResolvedValue({
      items: [
        {
          id: 'grant-1',
          source_id: 'source-1',
          source_key: 'synthetic-ats',
          source_display_name: 'Synthetic ATS',
          source_family: 'employer_ats',
          mechanism: 'oauth2_authorization_code',
          scope: 'submit_applications',
          granted_at: '2026-07-25T12:00:00Z',
        },
      ],
    })
    revokeSubmissionAuthorizationMock.mockRejectedValue(new Error('offline'))
    renderCard()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Revoke Synthetic ATS' }),
    )

    const revokeError = await screen.findByText(
      'Authorization could not be revoked. Try again.',
    )
    expect(revokeError.getAttribute('role')).toBe('alert')
    expect(screen.getByText('Synthetic ATS')).toBeTruthy()
  })

  it('never reuses one owner cache entry for another owner', async () => {
    listSubmissionAuthorizationsMock
      .mockResolvedValueOnce({
        items: [
          {
            id: 'grant-a',
            source_id: 'source-a',
            source_key: 'source-a',
            source_display_name: 'Owner A ATS',
            source_family: 'employer_ats',
            mechanism: 'oauth2_authorization_code',
            scope: 'submit_applications',
            granted_at: '2026-07-25T12:00:00Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'grant-b',
            source_id: 'source-b',
            source_key: 'source-b',
            source_display_name: 'Owner B ATS',
            source_family: 'employer_ats',
            mechanism: 'oauth2_authorization_code',
            scope: 'submit_applications',
            granted_at: '2026-07-25T13:00:00Z',
          },
        ],
      })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const view = renderCard('user-a', client)
    expect(await screen.findByText('Owner A ATS')).toBeTruthy()

    view.rerender(
      <QueryClientProvider client={client}>
        <SubmissionAuthorizationsCard userId="user-b" />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Owner B ATS')).toBeTruthy()
    expect(screen.queryByText('Owner A ATS')).toBeNull()
  })
})
