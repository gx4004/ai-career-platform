import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HistoryPage } from '#/components/history/HistoryPage'

const workspace = vi.hoisted(() => ({
  id: 'workspace-1',
  label: 'Application sprint',
  is_pinned: false,
  company: null,
  role: null,
  status: null,
  deadline: null,
  listing: null,
  linked_run_ids: ['run-1'],
  last_active_tool: null,
  last_active_result_id: null,
  updated_at: new Date().toISOString(),
}))

vi.mock('#/lib/telemetry/client', () => ({ trackTelemetry: vi.fn() }))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
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
    data: { items: [], total: 0, page: 1, page_size: 12, has_more: false },
    isPending: false,
    isLoading: false,
    isError: false,
  }),
}))

vi.mock('#/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/api/client')>()),
  getHistoryItem: vi.fn(),
  getHistoryWorkspaces: vi.fn().mockResolvedValue({ items: [workspace] }),
}))

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <HistoryPage search={{}} onSearchChange={vi.fn()} />
    </QueryClientProvider>,
  )
}

afterEach(() => vi.unstubAllEnvs())

describe('HistoryPage — R13 campaign entry point', () => {
  it('hides the campaign link while R13 is dark so it cannot land on Not Found', async () => {
    renderPage()
    // The workspace card itself still renders; only the gated entry point is gone.
    await waitFor(() => expect(screen.getByText('Application sprint')).toBeTruthy())
    expect(screen.queryByRole('link', { name: 'Open campaign' })).toBeNull()
  })

  it('shows the campaign link once the full R13 chain is enabled', async () => {
    vi.stubEnv('VITE_R11_EVIDENCE_PROFILE_ENABLED', 'true')
    vi.stubEnv('VITE_R12_CV_STUDIO_ENABLED', 'true')
    vi.stubEnv('VITE_R13_CAMPAIGNS_ENABLED', 'true')

    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Open campaign' })).toBeTruthy(),
    )
  })
})
