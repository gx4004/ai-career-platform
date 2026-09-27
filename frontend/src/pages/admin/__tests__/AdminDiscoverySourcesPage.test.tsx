import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AdminDiscoverySourcesPage } from '#/pages/admin/admin-discovery-sources-page'

const getAdminDiscoverySourcesMock = vi.hoisted(() => vi.fn())
const setDiscoverySourceKillSwitchMock = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/admin', () => ({
  getAdminDiscoverySources: getAdminDiscoverySourcesMock,
  setDiscoverySourceKillSwitch: setDiscoverySourceKillSwitchMock,
}))

function source(overrides: Record<string, unknown> = {}) {
  return {
    id: 'source-1',
    source_key: 'licensed-example',
    display_name: 'Licensed Example Feed',
    source_family: 'licensed',
    owner: 'Discovery Operations',
    terms_status: 'accepted',
    terms_reviewed_at: '2026-07-13T00:00:00Z',
    terms_reviewed_by: 'Legal Reviewer',
    allowed_behavior: 'feed',
    endpoint_url: 'https://fixture.example/jobs',
    allowed_query_parameters: ['role', 'location'],
    robots_policy: 'required',
    rate_limit_per_minute: 12,
    attribution_rule: 'Show source name and original link',
    retention_days: 30,
    kill_switch: false,
    ingestion_allowed: true,
    last_fetched_at: null,
    last_outcome: null,
    listing_count: null,
    created_at: '2026-07-13T00:00:00Z',
    updated_at: '2026-07-13T00:00:00Z',
    ...overrides,
  }
}

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
    renderPage([source()])

    expect(await screen.findByText('Licensed Example Feed')).toBeTruthy()
    expect(screen.getByText('Discovery Operations')).toBeTruthy()
    expect(screen.getByText('https://fixture.example/jobs')).toBeTruthy()
    expect(screen.getByText('Query: role, location')).toBeTruthy()
    expect(screen.getByText('Robots: required')).toBeTruthy()
    expect(screen.getByText('accepted')).toBeTruthy()
    expect(screen.getByText('Legal Reviewer', { exact: false })).toBeTruthy()
    expect(screen.getByText('12/minute')).toBeTruthy()
    expect(screen.getByText('Retain 30 days')).toBeTruthy()
    expect(screen.getByText('Allowed')).toBeTruthy()
  })

  it('renders an employer-ATS source with a provider-specific query parameter', async () => {
    renderPage([
      source({
        id: 'source-ats-1',
        source_key: 'employer-ats-greenhouse-figma',
        display_name: 'Figma',
        source_family: 'employer_ats',
        allowed_behavior: 'ats_integration',
        endpoint_url: 'https://boards-api.greenhouse.io/v1/boards/figma/jobs',
        allowed_query_parameters: ['content'],
        robots_policy: 'not_applicable',
        rate_limit_per_minute: 20,
        retention_days: 45,
      }),
    ])

    expect(await screen.findByText('Figma')).toBeTruthy()
    expect(screen.getByText('Query: content')).toBeTruthy()
    expect(screen.getByText('Robots: not_applicable')).toBeTruthy()
  })

  it('shows each source\'s last fetch status', async () => {
    renderPage([
      source({
        id: 'ok-source',
        display_name: 'Healthy Board',
        last_fetched_at: '2026-09-27T06:00:00Z',
        last_outcome: 'ok',
        listing_count: 42,
      }),
      source({
        id: 'failed-source',
        source_key: 'failed-board',
        display_name: 'Dead Board',
        last_fetched_at: '2026-09-27T06:00:00Z',
        last_outcome: 'failed: HTTPStatusError',
        listing_count: 7,
      }),
      source({ id: 'new-source', source_key: 'new-board', display_name: 'New Board' }),
    ])

    expect(await screen.findByText('Healthy Board')).toBeTruthy()
    expect(screen.getByText('OK')).toBeTruthy()
    expect(screen.getByText('42 listings')).toBeTruthy()
    expect(screen.getByText('failed: HTTPStatusError')).toBeTruthy()
    expect(screen.getByText('7 listings')).toBeTruthy()
    expect(screen.getByText('Never fetched')).toBeTruthy()
  })

  it('makes the all-disabled empty state explicit', async () => {
    renderPage([])
    expect(
      await screen.findByText(
        'No discovery sources are registered. Ingestion remains disabled.',
      ),
    ).toBeTruthy()
  })

  it('offers a trip control for a live source and fires the kill switch', async () => {
    setDiscoverySourceKillSwitchMock.mockResolvedValue(source({ kill_switch: true }))
    renderPage([source({ kill_switch: false })])

    const trip = (await screen.findByText('Trip kill switch')) as HTMLButtonElement
    expect(trip.disabled).toBeFalsy()
    fireEvent.click(trip)
    await waitFor(() =>
      expect(setDiscoverySourceKillSwitchMock).toHaveBeenCalledWith('source-1', true),
    )
  })

  it('offers a clear control when the kill switch is tripped', async () => {
    renderPage([source({ kill_switch: true, ingestion_allowed: false })])
    const clear = (await screen.findByText('Clear kill switch')) as HTMLButtonElement
    expect(clear.disabled).toBeFalsy()
  })

  it('blocks clearing a tripped source until terms are accepted', async () => {
    renderPage([
      source({
        kill_switch: true,
        terms_status: 'pending',
        terms_reviewed_at: null,
        terms_reviewed_by: null,
        ingestion_allowed: false,
      }),
    ])
    const clear = (await screen.findByText('Clear kill switch')) as HTMLButtonElement
    expect(clear.disabled).toBeTruthy()
    expect(screen.getByText('Accept terms review to clear.')).toBeTruthy()
  })
})
