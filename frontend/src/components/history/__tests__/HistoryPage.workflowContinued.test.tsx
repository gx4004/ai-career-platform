import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HistoryPage } from '#/components/history/HistoryPage'

const trackTelemetryMock = vi.hoisted(() => vi.fn())
const navigateMock = vi.hoisted(() => vi.fn())
const getHistoryItemMock = vi.hoisted(() => vi.fn())
const historyItems = vi.hoisted(() => ({ current: [] as unknown[] }))

const run = {
  id: 'run-1',
  tool_name: 'resume',
  label: 'My resume run',
  is_favorite: false,
  created_at: new Date().toISOString(),
  saved: true,
  access_mode: 'authenticated' as const,
  locked_actions: [],
  metadata: {
    summary_headline: 'Solid baseline',
    primary_recommendation_title: 'Backend Engineer',
    schema_version: 'v1',
    linked_context_ids: [],
    next_step_tool: 'job-match',
  },
  workspace: null,
}

vi.mock('#/lib/telemetry/client', () => ({
  trackTelemetry: trackTelemetryMock,
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({ status: 'authenticated', openAuthDialog: vi.fn() }),
}))

vi.mock('#/hooks/useFavoriteToggle', () => ({
  useFavoriteToggle: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('#/hooks/useHistory', () => ({
  useHistory: () => ({
    data: { items: historyItems.current, total: historyItems.current.length, page: 1, page_size: 12, has_more: false },
    isPending: false,
    isLoading: false,
    isError: false,
  }),
}))

vi.mock('#/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/api/client')>()),
  getHistoryItem: getHistoryItemMock,
  getHistoryWorkspaces: vi.fn().mockResolvedValue({ items: [] }),
}))

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <HistoryPage search={{}} onSearchChange={vi.fn()} />
    </QueryClientProvider>,
  )
}

describe('HistoryPage — workflow_continued telemetry (D-040)', () => {
  beforeEach(() => {
    historyItems.current = [run]
    trackTelemetryMock.mockReset()
    navigateMock.mockReset().mockResolvedValue(undefined)
    getHistoryItemMock.mockReset().mockResolvedValue({
      ...run,
      parent_run_id: null,
      result_payload: {},
    })
  })

  it('fires workflow_continued once when continuing a completed run to its next tool', async () => {
    renderPage()

    expect(screen.queryByRole('region', { name: 'Recent results reminder' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(getHistoryItemMock).toHaveBeenCalledWith('run-1'))
    await waitFor(() =>
      expect(trackTelemetryMock).toHaveBeenCalledWith({
        event_name: 'workflow_continued',
        tool_id: 'resume',
        access_mode: 'authenticated',
      }),
    )
    expect(
      trackTelemetryMock.mock.calls.filter(
        (call) => call[0]?.event_name === 'workflow_continued',
      ),
    ).toHaveLength(1)
    // Continuation still routes forward to the connected next-step tool.
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith({ to: '/job-match' }),
    )
  })
})

describe('HistoryPage — runs saved by older CV Studio checks (#362)', () => {
  it.each([
    ['cv-quality', 'Cv quality'],
    ['cv-tailoring', 'Cv tailoring'],
  ])('lists a %s run without tool actions', (toolName, label) => {
    historyItems.current = [{ ...run, id: `legacy-${toolName}`, tool_name: toolName, label: 'Old check' }]

    renderPage()

    expect(screen.getByText(label)).toBeTruthy()
    expect(screen.queryByText(toolName)).toBeNull()
    expect(screen.getByDisplayValue('Old check')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'View →' })).toBeNull()
  })

  it('shows "Application" rather than the raw tag for application drafts', () => {
    historyItems.current = [{ ...run, id: 'run-2', tool_name: 'application-drafts', label: 'Acme draft' }]
    renderPage()

    expect(screen.getAllByText('Application').length).toBeGreaterThan(0)
    expect(screen.queryByText('application-drafts')).toBeNull()
    expect(screen.getByLabelText('Label Application run')).toBeTruthy()
  })
})
