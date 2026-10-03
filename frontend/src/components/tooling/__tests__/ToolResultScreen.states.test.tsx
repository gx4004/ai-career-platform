import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToolResultScreen } from '#/components/tooling/ToolResultScreen'
import { ApiError } from '#/lib/api/errors'
import { clearTransientResults, setTransientResult } from '#/lib/tools/demoRuns'

const getHistoryItemMock = vi.hoisted(() => vi.fn())
const openAuthDialogMock = vi.hoisted(() => vi.fn())
const navigateMock = vi.hoisted(() => vi.fn())
let sessionStatus: 'guest' | 'authenticated' = 'authenticated'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => navigateMock,
    Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...props}>{children}</a>
    ),
  }
})
vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({ status: sessionStatus, openAuthDialog: openAuthDialogMock }),
}))
vi.mock('#/lib/telemetry/client', () => ({ trackTelemetry: vi.fn() }))
vi.mock('#/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/api/client')>()),
  getHistoryItem: getHistoryItemMock,
  setHistoryFavorite: vi.fn(),
}))

function renderScreen(historyId: string, toolId: 'resume' | 'job-match' = 'resume') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ToolResultScreen toolId={toolId} historyId={historyId} />
    </QueryClientProvider>,
  )
}

const savedRun = {
  id: 'run-1',
  tool_name: 'resume',
  label: 'Backend application',
  is_favorite: false,
  created_at: '2026-10-03T10:00:00Z',
  saved: true,
  access_mode: 'authenticated',
  locked_actions: [],
  metadata: {},
  workspace: null,
  parent_run_id: null,
  result_payload: {
    summary: { headline: 'A clear headline.', verdict: 'Solid', confidence_note: 'Directional.' },
    overall_score: 77,
    top_actions: [{ title: 'Add metrics', action: 'Quantify two bullets.', priority: 'high' }],
    score_breakdown: [{ key: 'impact', label: 'Impact', score: 70 }],
  },
}

describe('ToolResultScreen states', () => {
  beforeEach(() => {
    sessionStatus = 'authenticated'
    clearTransientResults()
    getHistoryItemMock.mockReset()
    navigateMock.mockReset()
    openAuthDialogMock.mockReset()
  })

  it('holds the report frame while the saved run is fetched', () => {
    getHistoryItemMock.mockReturnValue(new Promise(() => {}))
    renderScreen('run-1')
    expect(screen.getByRole('heading', { level: 1, name: 'Resume Analyzer' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Fetching saved output')
  })

  it('says a deleted run is gone and offers the way back', async () => {
    getHistoryItemMock.mockRejectedValue(new ApiError('Not found', 404))
    renderScreen('run-1')
    expect(await screen.findByRole('heading', { level: 1, name: 'This saved result is no longer available' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to history' }).getAttribute('href')).toBe('/history')
    expect(screen.getByRole('link', { name: 'Run the tool again' }).getAttribute('href')).toBe('/resume')
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('offers a retry when the request fails, and recovers', async () => {
    getHistoryItemMock.mockRejectedValueOnce(new ApiError('Server error', 500))
    renderScreen('run-1')
    expect(await screen.findByRole('heading', { name: 'This result could not be loaded' })).toBeTruthy()

    getHistoryItemMock.mockResolvedValueOnce(savedRun)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('A clear headline.')).toBeTruthy()
  })

  it('shows the expired state for a guest demo that is gone, without a retry', async () => {
    getHistoryItemMock.mockRejectedValue(new ApiError('Not found', 404))
    renderScreen('resume-demo-9')
    expect(await screen.findByRole('heading', { name: 'This guest demo is no longer available' })).toBeTruthy()
    expect(screen.queryByText('Demo expired')).toBeNull()
    expect(screen.queryByText('Not found')).toBeNull()
    expect(screen.getByRole('link', { name: 'Run the tool again' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Back to history' })).toBeNull()
  })

  it('opens the re-generate panel under the primary button and sends the feedback to the input page', async () => {
    getHistoryItemMock.mockResolvedValue(savedRun)
    renderScreen('run-1')
    const regenerate = await screen.findByRole('button', { name: 'Re-generate' })
    expect(regenerate.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(regenerate)
    expect(regenerate.getAttribute('aria-expanded')).toBe('true')
    fireEvent.change(screen.getByLabelText('Re-generate feedback'), { target: { value: 'More numbers' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(navigateMock).toHaveBeenCalledWith({ to: '/resume?parent_run_id=run-1&feedback=More+numbers' })
  })

  it('names the run in the header only when the label says more than the page already does', async () => {
    getHistoryItemMock.mockResolvedValue({ ...savedRun, label: 'Resume Analysis (77/100)' })
    const { unmount } = renderScreen('run-1')
    await screen.findByText('A clear headline.')
    expect(screen.queryByText('Resume Analysis')).toBeNull()
    unmount()

    getHistoryItemMock.mockResolvedValue(savedRun)
    renderScreen('run-2')
    expect(await screen.findByText('Backend application')).toBeTruthy()
  })

  it('exposes the favorite toggle with a pressed state, and a tooltip-named disabled one for guests', async () => {
    getHistoryItemMock.mockResolvedValue({ ...savedRun, is_favorite: true })
    const { unmount } = renderScreen('run-1')
    const star = await screen.findByRole('button', { name: 'Remove from favorites' })
    expect(star.getAttribute('aria-pressed')).toBe('true')
    unmount()

    sessionStatus = 'guest'
    const item = setTransientResult('resume', { summary: { headline: 'Guest headline' } })
    renderScreen(item.id)
    const guestStar = await screen.findByRole('button', { name: 'Sign in to favorite this result' })
    // aria-disabled, not disabled: the star keeps its focus stop and its name.
    expect(guestStar.getAttribute('aria-disabled')).toBe('true')
    await waitFor(() => expect(screen.getByText('Guest demo')).toBeTruthy())
  })

  it('keeps the actions after the report in the DOM, so the keyboard order is the visual order', async () => {
    getHistoryItemMock.mockResolvedValue(savedRun)
    renderScreen('run-1')
    const lead = await screen.findByText('A clear headline.')
    const regenerate = screen.getByRole('button', { name: 'Re-generate' })
    expect(lead.compareDocumentPosition(regenerate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('lays the actions out the same way on every tool: Re-generate and star, then the copy and export row', async () => {
    getHistoryItemMock.mockResolvedValue(savedRun)
    renderScreen('run-1')
    const regenerate = await screen.findByRole('button', { name: 'Re-generate' })
    expect(regenerate.className).toContain('kit-button--primary')
    const main = regenerate.closest('.result-actions__main')
    expect(main?.querySelector('[aria-label="Add to favorites"]')).toBeTruthy()
    const more = document.querySelector('.result-actions__more')
    expect(more?.textContent).toContain('Copy')
  })

  it('steps Re-generate back to secondary while interview practice mode is open', async () => {
    getHistoryItemMock.mockResolvedValue({
      ...savedRun,
      tool_name: 'interview',
      result_payload: {
        summary: { headline: 'Practice plan.' },
        questions: [{ question: 'Tell me about a hard bug.', answer: 'A race condition.', focus_area: 'Debugging', practice_first: true }],
      },
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <ToolResultScreen toolId="interview" historyId="run-1" />
      </QueryClientProvider>,
    )
    const regenerate = await screen.findByRole('button', { name: 'Re-generate' })
    expect(regenerate.className).toContain('kit-button--primary')
    fireEvent.click(screen.getByRole('button', { name: 'Practice mode' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Re-generate' }).className).toContain('kit-button--secondary'))
    fireEvent.click(screen.getByRole('button', { name: /Back to results/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Re-generate' }).className).toContain('kit-button--primary'))
  })
})
