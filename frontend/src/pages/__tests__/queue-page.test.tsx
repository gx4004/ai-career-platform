import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
const markPacketApplied = vi.hoisted(() => vi.fn())
const listQueueRules = vi.hoisted(() => vi.fn())
const upsertQueueRule = vi.hoisted(() => vi.fn())
const deleteQueueRule = vi.hoisted(() => vi.fn())
const getQueueSettings = vi.hoisted(() => vi.fn())
const updateQueueSettings = vi.hoisted(() => vi.fn())
const preparePackets = vi.hoisted(() => vi.fn())
const navigateSpy = vi.hoisted(() => vi.fn())
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
  markPacketApplied,
  listQueueRules,
  upsertQueueRule,
  deleteQueueRule,
  getQueueSettings,
  updateQueueSettings,
  preparePackets,
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

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => navigateSpy,
}))

const DEFAULT_SETTINGS = { max_packets_per_run: 20, cost_ceiling_usd: 5, estimated_packet_cost_usd: 0.1, is_default: true }

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
    applied_at: null,
    ...overrides,
  }
}

function renderPage(
  packets: unknown[],
  state: unknown = { paused: false },
  rules: unknown[] = [],
) {
  listPackets.mockResolvedValue({ items: packets })
  getQueueState.mockResolvedValue(state)
  listQueueRules.mockResolvedValue({ items: rules })
  getQueueSettings.mockResolvedValue(DEFAULT_SETTINGS)
  getPacketApprovalPreview.mockResolvedValue({
    destination_url: 'https://jobs.example/apply/1',
    material_sha256: 'd'.repeat(64),
    content: {
      listing: {
        title: 'Senior Backend Engineer',
        company: 'Acme',
        description: 'Build reliable backend systems.',
      },
      cv_variant: { id: 'variant-1', name: 'Platform roles', sections: [{ id: 'exp', title: 'Experience', entries: [{ id: 'e1', body: 'Led the platform team.' }] }] },
      drafts: { cover_letter: { body: 'Exact approved draft.' }, screening_answers: [{ question: 'Notice period?', answer: 'Two weeks.' }] },
    },
  })
  pauseQueue.mockResolvedValue({ paused: true })
  resumeQueue.mockResolvedValue({ paused: false })
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
  markPacketApplied.mockResolvedValue(makePacket({ decision: 'accepted', applied_at: '2026-07-26T00:00:00Z' }))
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

  it('shows the ready-for-review section with job title, company and match', async () => {
    renderPage([makePacket()])
    expect(await screen.findByText('Ready for review')).toBeTruthy()
    expect(await screen.findByText('Senior Backend Engineer')).toBeTruthy()
    expect(screen.getByText('Acme')).toBeTruthy()
    expect(screen.getByText('82%')).toBeTruthy()
  })

  it('shows an empty state pointing to Discover when the queue is empty', async () => {
    renderPage([])
    expect(await screen.findByText(/Nothing in your queue yet/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Discover jobs/i })).toBeTruthy()
  })

  it('approves a packet from the review drawer once reviewed', async () => {
    renderPage([makePacket()])
    fireEvent.click(await screen.findByRole('button', { name: /Review application/i }))
    const approve = await screen.findByRole('button', { name: /^Approve$/ })
    expect((approve as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: /I've looked this over/i }))
    expect((approve as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(approve)
    await waitFor(() =>
      expect(acceptPacket).toHaveBeenCalledWith('packet-abcdef12', 'd'.repeat(64)),
    )
  })

  it('gives the approved card a safe apply link with target and rel set', async () => {
    renderPage([makePacket({ decision: 'accepted' })])
    const link = await screen.findByRole('link', { name: /Apply on company site/i })
    await waitFor(() => expect(link.getAttribute('href')).toBe('https://jobs.example/apply/1'))
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('offers copy-to-clipboard for the prepared cover letter and screening answers', async () => {
    renderPage([makePacket({ decision: 'accepted' })])
    expect(await screen.findByRole('button', { name: /Copy Cover letter/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Copy Notice period/i })).toBeTruthy()
  })

  it('marks an approved packet as applied', async () => {
    renderPage([makePacket({ decision: 'accepted' })])
    fireEvent.click(await screen.findByRole('button', { name: /Mark as applied/i }))
    await waitFor(() => expect(markPacketApplied).toHaveBeenCalledWith('packet-abcdef12'))
  })

  it('shows an Applied pill instead of the mark-applied control once applied', async () => {
    renderPage([makePacket({ decision: 'accepted', applied_at: '2026-07-26T00:00:00Z' })])
    expect(await screen.findByText('Applied')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Mark as applied/i })).toBeNull()
  })

  it('disables approve while an unresolved question blocks it (D-095)', async () => {
    renderPage([
      makePacket({
        status: 'blocked',
        unresolved_questions: [
          { field: 'salary', category: 'salary', question: 'Desired salary?' },
        ],
      }),
    ])
    fireEvent.click(await screen.findByRole('button', { name: /Review application/i }))
    expect(await screen.findByText(/Before you can approve this/i)).toBeTruthy()
    expect((screen.getByRole('button', { name: /^Approve$/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('resolves a blocking question, then allows approval', async () => {
    renderPage([
      makePacket({
        status: 'blocked',
        unresolved_questions: [
          { field: 'salary', category: 'salary', question: 'Desired salary?' },
        ],
      }),
    ])
    fireEvent.click(await screen.findByRole('button', { name: /Review application/i }))
    fireEvent.change(await screen.findByLabelText(/Your answer to/), {
      target: { value: 'Market rate' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Save answer/i }))
    await waitFor(() =>
      expect(answerPacketStopQuestion).toHaveBeenCalledWith('packet-abcdef12', {
        field: 'salary',
        answer: 'Market rate',
      }),
    )
  })

  it('skips and rejects a packet from the drawer', async () => {
    renderPage([makePacket()])
    fireEvent.click(await screen.findByRole('button', { name: /Review application/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^Skip$/ }))
    await waitFor(() => expect(skipPacket).toHaveBeenCalledWith('packet-abcdef12'))
  })

  it('edits a packet by reopening it and navigating to CV Studio', async () => {
    renderPage([makePacket()])
    fireEvent.click(await screen.findByRole('button', { name: /Review application/i }))
    fireEvent.click(await screen.findByRole('button', { name: /Edit in CV Studio/i }))
    await waitFor(() => expect(editPacket).toHaveBeenCalledWith('packet-abcdef12'))
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith({ to: '/cv-studio' }))
  })

  it('pauses the whole queue and reflects the halted state', async () => {
    renderPage([makePacket()], { paused: false })
    fireEvent.click(await screen.findByRole('button', { name: /Pause queue/i }))
    await waitFor(() => expect(pauseQueue).toHaveBeenCalled())
  })

  it('shows the paused banner and a resume control when the queue is paused', async () => {
    renderPage([makePacket()], { paused: true })
    expect(await screen.findByText(/Queue paused/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Resume queue/i })).toBeTruthy()
  })

  it('adds a keyword rule and saves it', async () => {
    upsertQueueRule.mockResolvedValue({
      id: 'rule-1', rule_type: 'role', keywords: ['backend engineer'], min_score: null,
      created_at: '2026-07-14T00:00:00Z', updated_at: '2026-07-14T00:00:00Z',
    })
    renderPage([])
    const input = await screen.findByLabelText('Keywords')
    fireEvent.change(input, { target: { value: 'backend engineer' } })
    fireEvent.click(within(input.closest('form') as HTMLElement).getByRole('button', { name: /^Add$/ }))
    await waitFor(() =>
      expect(upsertQueueRule).toHaveBeenCalledWith({
        rule_type: 'role',
        keywords: ['backend engineer'],
      }),
    )
  })

  it('shows saved location and role keywords as removable chips', async () => {
    renderPage([], { paused: false }, [
      { id: 'rule-1', rule_type: 'role', keywords: ['backend engineer'], min_score: null, created_at: '2026-07-14T00:00:00Z', updated_at: '2026-07-14T00:00:00Z' },
      { id: 'rule-2', rule_type: 'location', keywords: ['Berlin'], min_score: null, created_at: '2026-07-14T00:00:00Z', updated_at: '2026-07-14T00:00:00Z' },
    ])
    expect(await screen.findByText('backend engineer')).toBeTruthy()
    expect(screen.getByText('Berlin')).toBeTruthy()
  })

  it('never shows owner A packets or handoff after owner B replaces the session', async () => {
    const ownerAPacket = makePacket({
      id: 'alpha-owner-a',
      campaign_id: 'campaign-owner-a',
      decision: 'accepted',
    })
    const ownerBPacket = makePacket({
      id: 'bravo-owner-b',
      campaign_id: 'campaign-owner-b',
    })
    const view = renderPage([ownerAPacket])

    expect(
      await screen.findByRole('link', { name: /Apply on company site/i }),
    ).toBeTruthy()

    sessionState.user = { id: 'owner-b', email: 'owner-b@example.com' }
    listPackets.mockResolvedValue({ items: [ownerBPacket] })
    getQueueState.mockResolvedValue({ paused: false })
    view.rerenderPage()

    await waitFor(() => {
      expect(screen.getByText('Ready for review')).toBeTruthy()
      expect(
        screen.queryByRole('link', { name: /Apply on company site/i }),
      ).toBeNull()
    })
    expect(
      view.client.getQueryData(['queue', 'owner-b', 'packets']),
    ).toEqual({ items: [ownerBPacket] })
  })
})
