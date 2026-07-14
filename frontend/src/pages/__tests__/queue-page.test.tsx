import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QueuePage } from '#/pages/queue-page'

const listPackets = vi.hoisted(() => vi.fn())
const getQueueState = vi.hoisted(() => vi.fn())
const pauseQueue = vi.hoisted(() => vi.fn())
const resumeQueue = vi.hoisted(() => vi.fn())
const acceptPacket = vi.hoisted(() => vi.fn())
const skipPacket = vi.hoisted(() => vi.fn())
const rejectPacket = vi.hoisted(() => vi.fn())
const editPacket = vi.hoisted(() => vi.fn())
const answerPacketStopQuestion = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/client', () => ({
  listPackets,
  getQueueState,
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

function makePacket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'packet-abcdef12',
    campaign_id: 'ws-1',
    listing_id: 'listing-1',
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
  pauseQueue.mockResolvedValue({ paused: true, preparation_halted: false })
  resumeQueue.mockResolvedValue({ paused: false, preparation_halted: false })
  acceptPacket.mockResolvedValue(makePacket({ decision: 'accepted' }))
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
  render(
    <QueryClientProvider client={client}>
      <QueuePage />
    </QueryClientProvider>,
  )
}

describe('QueuePage', () => {
  it('accepts a prepared packet with no unresolved questions', async () => {
    renderPage([makePacket()])
    const accept = await screen.findByRole('button', { name: /Accept/ })
    expect((accept as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(accept)
    await waitFor(() => expect(acceptPacket).toHaveBeenCalledWith('packet-abcdef12'))
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
    await waitFor(() =>
      expect((screen.getByRole('button', { name: /Accept/ }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
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
})
