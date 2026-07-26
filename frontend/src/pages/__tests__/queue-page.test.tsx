import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueuePage } from '#/pages/queue-page'

const listPackets = vi.hoisted(() => vi.fn())
const getQueueState = vi.hoisted(() => vi.fn())
const getPacketApprovalPreview = vi.hoisted(() => vi.fn())
const pauseQueue = vi.hoisted(() => vi.fn())
const resumeQueue = vi.hoisted(() => vi.fn())
const acceptPacket = vi.hoisted(() => vi.fn())
const skipPacket = vi.hoisted(() => vi.fn())
const rejectPacket = vi.hoisted(() => vi.fn())
const editPacket = vi.hoisted(() => vi.fn())
const answerPacketStopQuestion = vi.hoisted(() => vi.fn())
const sessionState = vi.hoisted(() => ({
  user: { id: 'owner-a', email: 'owner-a@example.com' } as {
    id: string
    email: string
  } | null,
}))

vi.mock('#/lib/api/client', () => ({
  listPackets,
  getQueueState,
  getPacketApprovalPreview,
  pauseQueue,
  resumeQueue,
  acceptPacket,
  skipPacket,
  rejectPacket,
  editPacket,
  answerPacketStopQuestion,
}))

vi.mock('#/components/app/PageFrame', () => ({
  PageFrame: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({
    status: sessionState.user ? 'authenticated' : 'guest',
    user: sessionState.user,
  }),
}))

function makePacket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'packet-abcdef12',
    campaign_id: 'ws-1',
    listing_id: 'listing-1',
    listing_attribution_id: 'attribution-1',
    cv_variant_id: 'variant-1',
    drafts_run_id: 'run-1',
    review_run_id: 'review-1',
    status: 'prepared',
    gate_state: 'passed',
    decision: 'pending',
    match_rationale: { composite_score: 82, signals: [], matched_rules: [] },
    unresolved_questions: [],
    estimated_cost_usd: 0.05,
    created_at: '2026-07-14T00:00:00Z',
    updated_at: '2026-07-14T00:00:00Z',
    ...overrides,
  }
}

function renderPage(
  packets: unknown[],
  state: unknown = { paused: false, preparation_halted: false },
) {
  listPackets.mockResolvedValue({ items: packets })
  getQueueState.mockResolvedValue(state)
  getPacketApprovalPreview.mockResolvedValue({
    destination_url: 'https://jobs.example/apply/1',
    material_sha256: 'd'.repeat(64),
    content: {
      listing: {
        title: 'Senior Backend Engineer',
        company: 'Acme',
        description: 'Build reliable backend systems.',
      },
      cv_variant: { id: 'variant-1', sections: [{ title: 'Experience' }] },
      drafts: { cover_letter: { body: 'Exact approved draft.' } },
    },
  })
  pauseQueue.mockResolvedValue({ paused: true, preparation_halted: false })
  resumeQueue.mockResolvedValue({ paused: false, preparation_halted: false })
  acceptPacket.mockResolvedValue({
    packet: makePacket({ decision: 'accepted' }),
    snapshot: {
      id: 'snapshot-1',
      packet_id: 'packet-abcdef12',
      campaign_id: 'ws-1',
      listing_id: 'listing-1',
      role_key: 'acme|backend engineer',
      destination_url: 'https://jobs.example/apply/1',
      content: { schema_version: 'packet-approval/v1' },
      content_sha256: 'a'.repeat(64),
      created_at: '2026-07-25T12:00:00Z',
    },
    handoff: {
      destination_url: 'https://jobs.example/apply/1',
      instructions: 'Open the official listing and submit it yourself.',
    },
  })
  skipPacket.mockResolvedValue(makePacket({ decision: 'skipped' }))
  rejectPacket.mockResolvedValue(makePacket({ decision: 'rejected' }))
  editPacket.mockResolvedValue(makePacket({ decision: 'pending' }))
  answerPacketStopQuestion.mockResolvedValue({
    packet_id: 'packet-abcdef12',
    resolved_field: 'salary',
    remaining_unresolved: 0,
    approvable: true,
    unresolved_questions: [],
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={client}>
      <QueuePage />
    </QueryClientProvider>,
  )
  return {
    client,
    ...view,
    rerenderPage: () =>
      view.rerender(
        <QueryClientProvider client={client}>
          <QueuePage />
        </QueryClientProvider>,
      ),
  }
}

describe('QueuePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionState.user = { id: 'owner-a', email: 'owner-a@example.com' }
  })

  it('accepts a prepared packet with no unresolved questions', async () => {
    renderPage([makePacket()])
    const accept = await screen.findByRole('button', { name: /Accept/ })
    expect((accept as HTMLButtonElement).disabled).toBe(true)
    expect(await screen.findByText(/Build reliable backend systems/)).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: /I reviewed these exact materials/i }))
    expect((accept as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(accept)
    await waitFor(() =>
      expect(acceptPacket).toHaveBeenCalledWith('packet-abcdef12', 'd'.repeat(64)),
    )
  })

  it('shows a safe user-driven link to the official destination after approval', async () => {
    renderPage([makePacket()])

    fireEvent.click(await screen.findByRole('checkbox', { name: /I reviewed these exact materials/i }))
    fireEvent.click(await screen.findByRole('button', { name: /Accept/ }))

    const link = await screen.findByRole('link', {
      name: /Open official application destination/i,
    })
    expect(link.getAttribute('href')).toBe('https://jobs.example/apply/1')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(screen.getByText(/submit it yourself/i)).toBeTruthy()
  })

  it('disables accept while an unresolved question blocks approval (D-095)', async () => {
    renderPage([
      makePacket({
        status: 'blocked',
        unresolved_questions: [
          { field: 'salary', category: 'salary', question: 'Desired salary?' },
        ],
      }),
    ])
    const accept = await screen.findByRole('button', { name: /Accept/ })
    expect((accept as HTMLButtonElement).disabled).toBe(true)
    expect(
      screen.getByRole('heading', { name: /Unresolved questions block acceptance/i }),
    ).toBeTruthy()
    expect(
      screen.getByText(/Accept is disabled until every unresolved question is answered/i),
    ).toBeTruthy()
  })

  it('enables accept after the blocking stop question is answered', async () => {
    renderPage([
      makePacket({
        status: 'blocked',
        unresolved_questions: [
          { field: 'salary', category: 'salary', question: 'Desired salary?' },
        ],
      }),
    ])
    await screen.findByRole('button', { name: /Accept/ })
    fireEvent.change(screen.getByLabelText(/Your answer to/), {
      target: { value: 'Market rate' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Save answer/ }))
    await waitFor(() =>
      expect(answerPacketStopQuestion).toHaveBeenCalledWith('packet-abcdef12', {
        field: 'salary',
        answer: 'Market rate',
      }),
    )
    fireEvent.click(await screen.findByRole('checkbox', { name: /I reviewed these exact materials/i }))
    await waitFor(() =>
      expect((screen.getByRole('button', { name: /Accept/ }) as HTMLButtonElement).disabled).toBe(false),
    )
  })

  it('shows the non-answerable CV hint for a missing-material question', async () => {
    renderPage([
      makePacket({
        status: 'blocked',
        cv_variant_id: null,
        unresolved_questions: [
          { field: 'cv_variant', category: 'missing_material', question: 'Select a CV.' },
        ],
      }),
    ])
    expect(await screen.findByText(/cannot be answered here/i)).toBeTruthy()
    // No answer input is offered for a non-stop question.
    expect(screen.queryByLabelText(/Your answer to/)).toBeNull()
  })

  it('asks for re-preparation when a required non-CV reference disappeared', async () => {
    renderPage([
      makePacket({
        status: 'blocked',
        listing_id: null,
        unresolved_questions: [
          {
            field: 'listing',
            category: 'missing_material',
            question: 'The target listing is no longer available.',
          },
        ],
      }),
    ])

    expect(await screen.findByText(/re-prepare this packet/i)).toBeTruthy()
    expect(screen.queryByText(/Select or tailor a CV variant/i)).toBeNull()
  })

  it('skips and rejects a packet through the per-packet controls', async () => {
    renderPage([makePacket()])
    fireEvent.click(await screen.findByRole('button', { name: /Skip/ }))
    await waitFor(() => expect(skipPacket).toHaveBeenCalledWith('packet-abcdef12'))
    fireEvent.click(screen.getByRole('button', { name: /Reject/ }))
    await waitFor(() => expect(rejectPacket).toHaveBeenCalledWith('packet-abcdef12'))
  })

  it('edits (reopens) a packet through the per-packet control', async () => {
    renderPage([makePacket({ decision: 'rejected' })])
    fireEvent.click(await screen.findByRole('button', { name: /Edit/ }))
    await waitFor(() => expect(editPacket).toHaveBeenCalledWith('packet-abcdef12'))
  })

  it('pauses the whole queue and reflects the halted state', async () => {
    renderPage([makePacket()], { paused: false, preparation_halted: false })
    const toggle = await screen.findByRole('button', { name: /Pause queue/ })
    fireEvent.click(toggle)
    await waitFor(() => expect(pauseQueue).toHaveBeenCalled())
  })

  it('shows the paused banner and a resume control when the queue is paused', async () => {
    renderPage([makePacket()], { paused: true, preparation_halted: false })
    expect(await screen.findByText(/Queue paused/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Resume queue/ })).toBeTruthy()
  })

  it('shows a terminal stop explanation and the frozen official handoff', async () => {
    renderPage([
      makePacket({
        decision: 'accepted',
        submission_stop: {
          stop_event_id: 'stop-1',
          reason: 'challenge',
          explanation: 'The source requested a challenge, so automation stopped.',
          destination_url: 'https://jobs.example/apply/1',
          instructions: 'Open the official destination and submit it yourself.',
          stopped_at: '2026-07-26T16:00:00Z',
        },
      }),
    ])

    expect(await screen.findByText(/^Automation stopped\.$/i)).toBeTruthy()
    expect(screen.getByText(/source requested a challenge/i)).toBeTruthy()
    const link = screen.getByRole('link', {
      name: /Open official application destination/i,
    })
    expect(link.getAttribute('href')).toBe('https://jobs.example/apply/1')
  })

  it('never shows owner A packets or handoff after owner B replaces the session', async () => {
    const ownerAPacket = makePacket({
      id: 'alpha-owner-a',
      campaign_id: 'campaign-owner-a',
    })
    const ownerBPacket = makePacket({
      id: 'bravo-owner-b',
      campaign_id: 'campaign-owner-b',
    })
    const view = renderPage([ownerAPacket])

    fireEvent.click(await screen.findByRole('checkbox', { name: /I reviewed these exact materials/i }))
    fireEvent.click(await screen.findByRole('button', { name: /Accept/ }))
    expect(
      await screen.findByRole('link', {
        name: /Open official application destination/i,
      }),
    ).toBeTruthy()

    sessionState.user = { id: 'owner-b', email: 'owner-b@example.com' }
    listPackets.mockResolvedValue({ items: [ownerBPacket] })
    getQueueState.mockResolvedValue({ paused: false, preparation_halted: false })
    view.rerenderPage()

    await waitFor(() => {
      expect(screen.getByText(/Packet bravo-ow/i)).toBeTruthy()
      expect(screen.queryByText(/Packet alpha-ow/i)).toBeNull()
      expect(
        screen.queryByRole('link', {
          name: /Open official application destination/i,
        }),
      ).toBeNull()
    })
    expect(
      view.client.getQueryData(['queue', 'owner-b', 'packets']),
    ).toEqual({ items: [ownerBPacket] })
  })
})
