import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToolResultScreen } from '#/components/tooling/ToolResultScreen'
import { clearTransientResults, setTransientResult } from '#/lib/tools/demoRuns'

const openAuthDialogMock = vi.hoisted(() => vi.fn())
const sessionStatus = vi.hoisted(() => ({ value: 'guest' as 'guest' | 'authenticated' }))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    Link: ({ to, children, params: _params, ...props }: { to: string; children: React.ReactNode; params?: unknown }) => (
      <a href={to} {...props}>{children}</a>
    ),
  }
})

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({ status: sessionStatus.value, openAuthDialog: openAuthDialogMock }),
}))

vi.mock('#/lib/telemetry/client', () => ({ trackTelemetry: vi.fn() }))

vi.mock('#/lib/tools/resultDefinitions', () => ({
  FixFirstList: () => null,
  resultDefinitions: new Proxy(
    {},
    {
      get: () => ({
        summary: () => ({ facts: [] }),
        topActions: () => [],
        render: () => <div>RESULT_CONTENT_MARKER</div>,
        copyText: () => 'copied result',
      }),
    },
  ),
}))

function renderCached(toolId: 'job-match' | 'resume', run: Record<string, unknown>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['tool-run', run.id], run)
  render(
    <QueryClientProvider client={client}>
      <ToolResultScreen toolId={toolId} historyId={String(run.id)} />
    </QueryClientProvider>,
  )
}

const savedRun = (workspace: Record<string, unknown> | null) => ({
  id: 'run-jm-1',
  tool_name: 'job-match',
  label: 'Job Match (74%)',
  is_favorite: false,
  saved: true,
  access_mode: 'authenticated',
  locked_actions: [],
  parent_run_id: null,
  metadata: {},
  workspace,
  result_payload: { summary: { headline: 'A solid match' } },
  created_at: '2026-10-03T10:00:00Z',
})

describe('ToolResultScreen follow-ups (T18)', () => {
  beforeEach(() => {
    clearTransientResults()
    openAuthDialogMock.mockReset()
    sessionStatus.value = 'guest'
  })

  it('shows the guest sticker with a create-account button that asks for the register view', () => {
    const item = setTransientResult('resume', { summary: { headline: 'Test headline' } })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <ToolResultScreen toolId="resume" historyId={item.id} />
      </QueryClientProvider>,
    )
    const sticker = screen.getByText('This result is not saved').closest('.kit-sticker') as HTMLElement
    expect(sticker.getAttribute('data-tone')).toBe('lemon')
    fireEvent.click(screen.getByRole('button', { name: 'Create free account' }))
    expect(openAuthDialogMock).toHaveBeenCalledWith(expect.objectContaining({ view: 'register', toolId: 'resume' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('This result is not saved')).toBeNull()
  })

  it('links a saved Job Match to its application, named for the role', () => {
    sessionStatus.value = 'authenticated'
    renderCached(
      'job-match',
      savedRun({ id: 'app-1', role: 'Platform Engineer', company: 'Harbor Health', status: 'saved', listing: null }),
    )
    const link = screen.getByRole('link', { name: /In applications: Platform Engineer at Harbor Health/ })
    expect(link.getAttribute('href')).toBe('/campaigns/$campaignId')
  })

  it('shows no application link for a match that is not an application', () => {
    sessionStatus.value = 'authenticated'
    renderCached('job-match', savedRun({ id: 'ws-1', role: null, company: null, status: null, listing: null }))
    expect(screen.queryByRole('link', { name: /In applications/ })).toBeNull()
  })
})
