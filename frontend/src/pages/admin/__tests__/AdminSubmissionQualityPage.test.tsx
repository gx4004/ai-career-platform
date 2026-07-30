import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AdminSubmissionQualityPage } from '#/pages/admin/admin-submission-quality-page'

const getAdminSubmissionQualityMock = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/admin', () => ({
  getAdminSubmissionQuality: getAdminSubmissionQualityMock,
}))

function renderPage() {
  getAdminSubmissionQualityMock.mockResolvedValue({
    window_start: '2026-07-16T00:00:00Z',
    window_end: '2026-07-30T00:00:00Z',
    families: [
      {
        source_family: 'employer_ats',
        evidence_base: 8,
        response_rate: 0.5,
        packet_edit_rate: 0.25,
        duplicate_prevention_rate: 0.2,
        complaint_rate: 0,
      },
      {
        source_family: 'licensed',
        evidence_base: 0,
        response_rate: null,
        packet_edit_rate: null,
        duplicate_prevention_rate: null,
        complaint_rate: null,
      },
    ],
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AdminSubmissionQualityPage />
    </QueryClientProvider>,
  )
}

describe('AdminSubmissionQualityPage', () => {
  it('leads with quality rates and keeps sample volume contextual', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Submission Quality' })).toBeTruthy()
    expect(await screen.findByText('employer_ats')).toBeTruthy()
    expect(screen.getByText('50%')).toBeTruthy()
    expect(screen.getByText('25%')).toBeTruthy()
    expect(screen.getByText('20%')).toBeTruthy()
    expect(screen.getByText('8 confirmations')).toBeTruthy()
    expect(screen.getAllByText('Not enough evidence').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('surfaces a load error explicitly', async () => {
    getAdminSubmissionQualityMock.mockRejectedValue(new Error('boom'))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <AdminSubmissionQualityPage />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Failed to load submission quality.')).toBeTruthy()
  })
})
