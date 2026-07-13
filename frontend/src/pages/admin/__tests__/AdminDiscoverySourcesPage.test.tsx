import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AdminDiscoverySourcesPage } from '#/pages/admin/admin-discovery-sources-page'

const getAdminDiscoverySourcesMock = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/admin', () => ({
  getAdminDiscoverySources: getAdminDiscoverySourcesMock,
}))

function renderPage(items: Array<Record<string, unknown>>) {
  getAdminDiscoverySourcesMock.mockResolvedValue({ items })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AdminDiscoverySourcesPage />
    </QueryClientProvider>,
  )
}

describe('AdminDiscoverySourcesPage', () => {
  it('shows every governance field in a read-only table', async () => {
    renderPage([
      {
        id: 'source-1',
        source_key: 'licensed-example',
        display_name: 'Licensed Example Feed',
        source_family: 'licensed',
        owner: 'Discovery Operations',
        terms_status: 'accepted',
        terms_reviewed_at: '2026-07-13T00:00:00Z',
        terms_reviewed_by: 'Legal Reviewer',
        allowed_behavior: 'feed',
        rate_limit_per_minute: 12,
        attribution_rule: 'Show source name and original link',
        retention_days: 30,
        kill_switch: false,
        ingestion_allowed: true,
        created_at: '2026-07-13T00:00:00Z',
        updated_at: '2026-07-13T00:00:00Z',
      },
    ])

    expect(await screen.findByText('Licensed Example Feed')).toBeTruthy()
    expect(screen.getByText('Discovery Operations')).toBeTruthy()
    expect(screen.getByText('accepted')).toBeTruthy()
    expect(screen.getByText('Legal Reviewer', { exact: false })).toBeTruthy()
    expect(screen.getByText('12/minute')).toBeTruthy()
    expect(screen.getByText('Retain 30 days')).toBeTruthy()
    expect(screen.getByText('Allowed')).toBeTruthy()
  })

  it('makes the all-disabled empty state explicit', async () => {
    renderPage([])
    expect(
      await screen.findByText(
        'No discovery sources are registered. Ingestion remains disabled.',
      ),
    ).toBeTruthy()
  })
})
