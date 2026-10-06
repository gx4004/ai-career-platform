import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '#/components/kit'
import { ApiError } from '#/lib/api/errors'
import { AdminDiscoverySourcesPage } from '#/pages/admin/admin-discovery-sources-page'

const getAdminDiscoverySourcesMock = vi.hoisted(() => vi.fn())
const setDiscoverySourceKillSwitchMock = vi.hoisted(() => vi.fn())

const retrySourceFetchMock = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/admin', () => ({
  getAdminDiscoverySources: getAdminDiscoverySourcesMock,
  setDiscoverySourceKillSwitch: setDiscoverySourceKillSwitchMock,
}))
vi.mock('#/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/api/client')>()),
  retrySourceFetch: retrySourceFetchMock,
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
    rate_limit_per_minute: 12,
    attribution_rule: 'Show source name and original link',
    retention_days: 30,
    kill_switch: false,
    ingestion_allowed: true,
    last_fetched_at: null,
    last_outcome: null,
    failure_reason: null,
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
      <ToastProvider>
        <AdminDiscoverySourcesPage />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('AdminDiscoverySourcesPage', () => {
  it('shows every governance field in a read-only table', async () => {
    renderPage([source()])

    expect(await screen.findByText('Licensed Example Feed')).toBeTruthy()
    expect(screen.getByText('Discovery Operations')).toBeTruthy()
    expect(screen.getByText('https://fixture.example/jobs')).toBeTruthy()
    expect(screen.getByText('Accepted')).toBeTruthy()
    expect(screen.getByText('Legal Reviewer', { exact: false })).toBeTruthy()
    expect(screen.getByText('12/minute')).toBeTruthy()
    expect(screen.getByText('Retain 30 days')).toBeTruthy()
    expect(screen.getByText('Allowed')).toBeTruthy()
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
    expect(screen.getByText('Failed').closest('[data-tone]')?.getAttribute('data-tone')).toBe('danger')
    expect(screen.getByText('OK').closest('[data-tone]')?.getAttribute('data-tone')).toBe('success')
    expect(screen.getByText('7 listings')).toBeTruthy()
    expect(screen.getByText('Never fetched')).toBeTruthy()
  })

  it('shows the server\'s own words for a failed fetch and keeps the recorded error behind a disclosure (B13)', async () => {
    renderPage([
      source({
        last_fetched_at: '2026-09-27T06:00:00Z',
        last_outcome: 'failed: HTTPStatusError 404',
        failure_reason: 'The board was not found (HTTP 404): check the board name in the endpoint URL.',
        listing_count: 7,
      }),
    ])
    expect(await screen.findByText('The board was not found (HTTP 404): check the board name in the endpoint URL.')).toBeTruthy()
    expect(screen.queryByText('failed: HTTPStatusError 404')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Error detail' }))
    expect(screen.getByText('failed: HTTPStatusError 404')).toBeTruthy()
  })

  it('still says a fetch failed when the server sent no reason', async () => {
    renderPage([source({ last_fetched_at: '2026-09-27T06:00:00Z', last_outcome: 'failed: Mystery', failure_reason: null })])
    expect(await screen.findByText('The fetch failed.')).toBeTruthy()
  })

  const failedBoard = (overrides: Record<string, unknown> = {}) =>
    source({
      source_family: 'employer_ats',
      last_fetched_at: '2026-09-27T06:00:00Z',
      last_outcome: 'failed: HTTPStatusError 404',
      failure_reason: 'The board was not found (HTTP 404): check the board name in the endpoint URL.',
      ...overrides,
    })

  it('retries a failed employer board and puts the new outcome in its row', async () => {
    const fetched = failedBoard({ last_fetched_at: '2026-10-06T09:00:00Z', last_outcome: 'ok', failure_reason: null, listing_count: 12 })
    retrySourceFetchMock.mockResolvedValue(fetched)
    renderPage([failedBoard()])
    const button = await screen.findByRole('button', { name: 'Retry fetch' })
    getAdminDiscoverySourcesMock.mockResolvedValue({ items: [fetched] })
    fireEvent.click(button)
    await waitFor(() => expect(retrySourceFetchMock).toHaveBeenCalledWith('source-1'))
    expect(await screen.findByText('Fetched Licensed Example Feed')).toBeTruthy()
    expect(screen.getByText('OK').closest('[data-tone]')?.getAttribute('data-tone')).toBe('success')
    // Once in the row's meta line and once in the toast.
    expect(screen.getAllByText('12 listings')).toHaveLength(2)
    expect(screen.queryByText('Failed')).toBeNull()
  })

  it('says why a retry did not run, in the rate-limit words of the error mapper', async () => {
    retrySourceFetchMock.mockRejectedValue(new ApiError('Rate limit exceeded: 6 per 1 minute', 429, undefined, { retryAfter: 60 }))
    renderPage([failedBoard()])
    fireEvent.click(await screen.findByRole('button', { name: 'Retry fetch' }))
    expect(await screen.findByText(/^Too many attempts\. Try again in 60/)).toBeTruthy()
  })

  it('offers no fetch for a source the server would refuse (not a board, kill switch on, terms pending)', async () => {
    renderPage([
      source({ id: 'licensed', last_fetched_at: '2026-09-27T06:00:00Z', last_outcome: 'failed: ReadTimeout' }),
      failedBoard({ id: 'tripped', kill_switch: true, ingestion_allowed: false }),
      failedBoard({ id: 'pending', terms_status: 'pending' }),
    ])
    expect(await screen.findAllByText('Failed')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: /fetch/i })).toBeNull()
  })

  it('says when a source has no listing count yet', async () => {
    renderPage([source({ last_fetched_at: '2026-09-27T06:00:00Z', last_outcome: 'ok', listing_count: null })])
    expect(await screen.findByText('No listing count yet')).toBeTruthy()
  })

  it('makes the all-disabled empty state explicit', async () => {
    renderPage([])
    expect(await screen.findByText('No discovery sources are registered.')).toBeTruthy()
    expect(screen.getByText('Ingestion remains disabled.')).toBeTruthy()
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

  it('says a value every source shares once, in the header, and not in every row', async () => {
    renderPage([
      source({ id: 'a', display_name: 'First Feed', owner: 'Platform team', source_family: 'employer_ats' }),
      source({ id: 'b', display_name: 'Second Feed', owner: 'Platform team', source_family: 'employer_ats' }),
    ])
    expect(await screen.findByText('Second Feed')).toBeTruthy()
    expect(screen.getAllByText('Owner: Platform team')).toHaveLength(1)
    expect(screen.queryByText('Platform team')).toBeNull()
    expect(screen.getAllByText('Family: employer_ats')).toHaveLength(1)
    expect(screen.queryByText('employer_ats')).toBeNull()
  })

  it('keeps a value that differs between sources in its row', async () => {
    renderPage([
      source({ id: 'a', display_name: 'First Feed', owner: 'Platform team' }),
      source({ id: 'b', display_name: 'Second Feed', owner: 'Operations' }),
    ])
    expect(await screen.findByText('Second Feed')).toBeTruthy()
    expect(screen.getByText('Platform team')).toBeTruthy()
    expect(screen.getByText('Operations')).toBeTruthy()
  })

  it('keeps the policy behind a disclosure', async () => {
    renderPage([source()])
    expect(await screen.findByText('Licensed Example Feed')).toBeTruthy()
    expect(screen.queryByText('Show source name and original link')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Policy' }))
    expect(screen.getByText('Show source name and original link')).toBeTruthy()
  })

  it('names a refused ingestion and a tripped kill switch', async () => {
    renderPage([source({ kill_switch: true, ingestion_allowed: false })])
    expect(await screen.findByText('Refused')).toBeTruthy()
    expect(screen.getByText('Kill switch on')).toBeTruthy()
  })
})
