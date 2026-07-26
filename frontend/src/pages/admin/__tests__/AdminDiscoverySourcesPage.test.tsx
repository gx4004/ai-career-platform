import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AdminDiscoverySourcesPage } from '#/pages/admin/admin-discovery-sources-page'

const getAdminDiscoverySourcesMock = vi.hoisted(() => vi.fn())
const setDiscoverySourceKillSwitchMock = vi.hoisted(() => vi.fn())
const getAdminSubmissionSafetyMock = vi.hoisted(() => vi.fn())
const setGlobalSubmissionKillSwitchMock = vi.hoisted(() => vi.fn())
const recordSubmissionIncidentRehearsalMock = vi.hoisted(() => vi.fn())
const configureSourceSubmissionSafetyMock = vi.hoisted(() => vi.fn())
const setSubmissionSourceKillSwitchMock = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/admin', () => ({
  getAdminDiscoverySources: getAdminDiscoverySourcesMock,
  setDiscoverySourceKillSwitch: setDiscoverySourceKillSwitchMock,
  getAdminSubmissionSafety: getAdminSubmissionSafetyMock,
  setGlobalSubmissionKillSwitch: setGlobalSubmissionKillSwitchMock,
  recordSubmissionIncidentRehearsal: recordSubmissionIncidentRehearsalMock,
  configureSourceSubmissionSafety: configureSourceSubmissionSafetyMock,
  setSubmissionSourceKillSwitch: setSubmissionSourceKillSwitchMock,
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
    submission_governance: {
      id: 'submission-source-1',
      legal_terms_status: 'accepted',
      legal_terms_reviewed_at: '2026-07-13T00:00:00Z',
      legal_terms_reviewed_by: 'Legal Reviewer',
      contract_status: 'verified',
      contract_version: 'synthetic-ats/v1',
      contract_fields: [
        {
          source_field: 'candidate_email',
          packet_field: 'candidate.email',
          required: true,
        },
      ],
      contract_formats: [
        { source_field: 'candidate_email', kind: 'email' },
      ],
      contract_error_semantics: [
        {
          source_code: 'accepted',
          meaning: 'accepted',
          handling: 'confirm_success',
        },
      ],
      contract_reviewed_at: '2026-07-13T00:00:00Z',
      contract_reviewed_by: 'Integration Reviewer',
      promoted: false,
      promoted_at: null,
      promoted_by: null,
      kill_switch: true,
      submission_allowed: false,
      created_at: '2026-07-13T00:00:00Z',
      updated_at: '2026-07-13T00:00:00Z',
    },
    created_at: '2026-07-13T00:00:00Z',
    updated_at: '2026-07-13T00:00:00Z',
    ...overrides,
  }
}

function renderPage(items: Array<Record<string, unknown>>) {
  getAdminDiscoverySourcesMock.mockResolvedValue({ items })
  getAdminSubmissionSafetyMock.mockResolvedValue({
    control: {
      global_kill_switch: true,
      incident_playbook_version: null,
      incident_rehearsed_at: null,
      updated_at: '2026-07-26T12:00:00Z',
    },
    policies: [],
  })
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
    expect(screen.getByText('Not promoted')).toBeTruthy()
    expect(screen.getByText('Legal: accepted')).toBeTruthy()
    expect(
      screen.getByText('Contract: verified (synthetic-ats/v1)'),
    ).toBeTruthy()
    expect(screen.getByText('Submission kill switch on')).toBeTruthy()
  })

  it('makes an unregistered submission gate explicitly refused', async () => {
    renderPage([source({ submission_governance: null })])
    expect(await screen.findByText('Not registered')).toBeTruthy()
    expect(screen.getByText('Submission remains refused.')).toBeTruthy()
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

  it('keeps global submission killed until a reachable rehearsal action runs', async () => {
    renderPage([source()])
    const clear = (await screen.findByRole('button', {
      name: 'Clear global submission kill switch',
    })) as HTMLButtonElement
    expect(clear.disabled).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Completed playbook version'), {
      target: { value: 'submission-v1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Record completed rehearsal' }))
    await waitFor(() =>
      expect(recordSubmissionIncidentRehearsalMock).toHaveBeenCalledWith(
        'submission-v1',
        expect.anything(),
      ),
    )
  })

  it('wires source limits and the submission kill switch to real actions', async () => {
    renderPage([source()])
    await screen.findByLabelText('User / minute')
    for (const [label, value] of [
      ['User / minute', '2'],
      ['User / 24 hours', '20'],
      ['Source / minute', '10'],
      ['Source / 24 hours', '100'],
      ['Anomaly attempts / hour', '8'],
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } })
    }
    fireEvent.click(screen.getByRole('button', { name: 'Configure submission limits' }))
    await waitFor(() =>
      expect(configureSourceSubmissionSafetyMock).toHaveBeenCalledWith(
        'source-1',
        expect.objectContaining({ user_rate_limit_per_minute: 2 }),
      ),
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Clear source submission kill switch' }),
    )
    await waitFor(() =>
      expect(setSubmissionSourceKillSwitchMock).toHaveBeenCalledWith('source-1', false),
    )
  })
})
