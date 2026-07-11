import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AdminScorecard, ScorecardTrigger } from '#/lib/api/admin'
import { AdminScorecardPage } from '#/pages/admin/admin-scorecard-page'

// R10 #136: the scorecard page renders each trigger's state and predeclared plan
// read-only. This test drives it with a FAKE scorecard payload covering a fired
// trigger (must show the "review required, nothing enabled automatically" note),
// a not-fired trigger, and an insufficient-sample trigger.

const getAdminScorecardMock = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/admin', () => ({
  getAdminScorecard: getAdminScorecardMock,
}))

function trigger(overrides: Partial<ScorecardTrigger> & { id: string }): ScorecardTrigger {
  return {
    label: overrides.id,
    threshold: 'threshold text',
    observation_window: '30 days',
    minimum_sample: 'min sample',
    evidence: 'evidence summary',
    evidence_detail: { incidents: 0 },
    evidence_fresh: true,
    last_evidence_at: '2026-07-11T00:00:00+00:00',
    state: 'not_fired',
    review_required: false,
    response_ticket: 138,
    response_ticket_title: 'response ticket',
    owner: 'Product owner',
    rollback: 'rollback text',
    exit_criteria: 'exit text',
    ...overrides,
  }
}

function renderPage(payload: AdminScorecard) {
  getAdminScorecardMock.mockResolvedValue(payload)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AdminScorecardPage />
    </QueryClientProvider>,
  )
}

describe('AdminScorecardPage', () => {
  it('renders states and flags a fired trigger as review-required only', async () => {
    renderPage({
      generated_at: '2026-07-11T12:00:00+00:00',
      window_start: '2026-06-11T12:00:00+00:00',
      window_end: '2026-07-11T12:00:00+00:00',
      replica_class: 'single',
      triggers: [
        trigger({
          id: 'provider_incidents',
          label: 'Provider incidents',
          state: 'fired',
          review_required: true,
        }),
        trigger({ id: 'abuse_cost', label: 'Abuse / cost pressure', state: 'not_fired' }),
        trigger({
          id: 'database_growth',
          label: 'Database growth',
          state: 'insufficient_sample',
        }),
      ],
    })

    expect(await screen.findByText('Provider incidents')).toBeTruthy()
    expect(screen.getByText('Fired')).toBeTruthy()
    expect(screen.getByText('Not fired')).toBeTruthy()
    expect(screen.getByText('Insufficient sample')).toBeTruthy()
    // A fired trigger explicitly states nothing is scaled automatically.
    expect(
      screen.getByText(/Review required — threshold crossed\. No response is enabled automatically\./),
    ).toBeTruthy()
  })
})
