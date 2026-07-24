import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminDevelopmentLoopPage } from '#/pages/admin/admin-development-loop-page'

const getAdminDevelopmentLoopMock = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/admin', () => ({
  getAdminDevelopmentLoop: getAdminDevelopmentLoopMock,
}))

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminDevelopmentLoopPage />
    </QueryClientProvider>,
  )
}

describe('AdminDevelopmentLoopPage', () => {
  beforeEach(() => {
    getAdminDevelopmentLoopMock.mockReset().mockResolvedValue({
      window_start: '2026-07-10T00:00:00Z',
      window_end: '2026-07-24T23:59:59Z',
      total_items_created: 3,
      total_items_deleted: 1,
      total_state_transitions: 2,
      created_by_gap_kind: [
        { gap_kind: 'missing_skill', count: 2 },
        { gap_kind: 'evidence_not_yet_produced', count: 1 },
      ],
      created_by_response_kind: [
        { response_kind: 'learn_skill', count: 2 },
        { response_kind: 'produce_evidence', count: 1 },
      ],
      state_transitions: [
        { from_state: 'planned', to_state: 'in_progress', count: 2 },
      ],
    })
  })

  it('renders only aggregate loop adoption counts', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Development Loop' })).toBeTruthy()
    await screen.findByText('missing skill')
    expect(screen.getByText('3', { selector: '.admin-info-row-value' })).toBeTruthy()
    expect(screen.getByText('learn skill')).toBeTruthy()
    expect(screen.getByText('planned → in progress')).toBeTruthy()
    expect(screen.queryByText(/gap description/i)).toBeNull()
    expect(screen.queryByText(/private notes/i)).toBeNull()
    await waitFor(() =>
      expect(getAdminDevelopmentLoopMock).toHaveBeenCalledWith({
        start: expect.stringMatching(/T00:00:00$/),
        end: expect.stringMatching(/T23:59:59\.999999$/),
      }),
    )
  })

  it('renders an explicit failure state', async () => {
    getAdminDevelopmentLoopMock.mockRejectedValue(new Error('synthetic failure'))
    renderPage()
    expect(
      await screen.findByText('Failed to load development loop metrics.'),
    ).toBeTruthy()
  })
})
