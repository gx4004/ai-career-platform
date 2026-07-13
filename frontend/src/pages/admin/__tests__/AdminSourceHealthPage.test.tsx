import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AdminSourceHealthPage } from '#/pages/admin/admin-source-health-page'

const getAdminSourceHealthMock = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/admin', () => ({
  getAdminSourceHealth: getAdminSourceHealthMock,
}))

function family(overrides: Record<string, unknown> = {}) {
  return {
    source_family: 'licensed',
    source_count: 2,
    active_count: 1,
    killed_count: 1,
    pending_terms_count: 0,
    listing_count: 5,
    stale_count: 1,
    oldest_retrieved_at: '2026-07-01T00:00:00Z',
    newest_retrieved_at: '2026-07-12T00:00:00Z',
    fetch_success: 8,
    fetch_failure: 2,
    fetch_blocked: 1,
    ingested: 4,
    deduplicated: 1,
    expired: 3,
    ...overrides,
  }
}

function renderPage(families: Array<Record<string, unknown>>) {
  getAdminSourceHealthMock.mockResolvedValue({
    window_start: '2026-06-29T00:00:00Z',
    window_end: '2026-07-13T00:00:00Z',
    staleness_threshold_days: 7,
    families,
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AdminSourceHealthPage />
    </QueryClientProvider>,
  )
}

describe('AdminSourceHealthPage', () => {
  it('renders per-family aggregate health counts', async () => {
    renderPage([family(), family({ source_family: 'user_provided', source_count: 0 })])

    expect(await screen.findByText('Source Health')).toBeTruthy()
    // Wait for the async query to resolve before asserting data-dependent rows.
    expect(await screen.findByText('licensed')).toBeTruthy()
    expect(screen.getByText('user_provided')).toBeTruthy()
    // Representative aggregate metrics render once per family row.
    expect(screen.getAllByText('registered').length).toBe(2)
    expect(screen.getAllByText('deduplicated').length).toBe(2)
    expect(screen.getAllByText('expired').length).toBe(2)
    // Staleness threshold is surfaced to the operator.
    expect(
      screen.getByText('A listing is stale after 7 days without a refresh.', {
        exact: false,
      }),
    ).toBeTruthy()
  })

  it('surfaces a load error explicitly', async () => {
    getAdminSourceHealthMock.mockRejectedValue(new Error('boom'))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <AdminSourceHealthPage />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Failed to load source health.')).toBeTruthy()
  })
})
