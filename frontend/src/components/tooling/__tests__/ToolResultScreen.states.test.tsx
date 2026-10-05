import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToolResultScreen } from '#/components/tooling/ToolResultScreen'
import { ApiError } from '#/lib/api/errors'
import { clearTransientResults, setTransientResult } from '#/lib/tools/demoRuns'

const getHistoryItemMock = vi.hoisted(() => vi.fn())
const openAuthDialogMock = vi.hoisted(() => vi.fn())
const navigateMock = vi.hoisted(() => vi.fn())
const setFavoriteMock = vi.hoisted(() => vi.fn())
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
  setHistoryFavorite: setFavoriteMock,
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

const withExportable = {
  ...savedRun,
  result_payload: { ...savedRun.result_payload, exportable_sections: [{ id: 'a', title: 'Summary', body: 'Body text.', items: [] }] },
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

  it('exposes the favorite toggle with a pressed state, and a sign-in prompt for guests', async () => {
    getHistoryItemMock.mockResolvedValue({ ...savedRun, is_favorite: true })
    const { unmount } = renderScreen('run-1')
    const star = await screen.findByRole('button', { name: 'Remove from favorites' })
    expect(star.getAttribute('aria-pressed')).toBe('true')
    unmount()

    sessionStatus = 'guest'
    const item = setTransientResult('resume', { summary: { headline: 'Guest headline' } })
    renderScreen(item.id)
    const guestStar = await screen.findByRole('button', { name: 'Sign in to favorite this result' })
    expect(guestStar.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(guestStar)
    expect(openAuthDialogMock).toHaveBeenCalledWith(expect.objectContaining({ reason: 'save-demo-result' }))
    await waitFor(() => expect(screen.getByText('This result is not saved')).toBeTruthy())
  })

  it('flips the star at once on a saved result read from the server, and keeps it flipped', async () => {
    getHistoryItemMock.mockResolvedValue(savedRun)
    setFavoriteMock.mockResolvedValue({})
    renderScreen('run-1')
    const star = await screen.findByRole('button', { name: 'Add to favorites' })
    expect(star.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(star)
    expect(screen.getByRole('button', { name: 'Remove from favorites' }).getAttribute('aria-pressed')).toBe('true')
    await waitFor(() => expect(setFavoriteMock).toHaveBeenCalledWith('run-1', true))
    expect(screen.getByRole('button', { name: 'Remove from favorites' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('puts the star back when the server refuses', async () => {
    getHistoryItemMock.mockResolvedValue(savedRun)
    setFavoriteMock.mockRejectedValue(new Error('nope'))
    renderScreen('run-1')
    fireEvent.click(await screen.findByRole('button', { name: 'Add to favorites' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add to favorites' }).getAttribute('aria-pressed')).toBe('false'))
  })

  it('puts the actions in the header, before the report, in reading order', async () => {
    getHistoryItemMock.mockResolvedValue(savedRun)
    renderScreen('run-1')
    const lead = await screen.findByText('A clear headline.')
    const regenerate = screen.getByRole('button', { name: 'Re-generate' })
    expect(regenerate.compareDocumentPosition(lead) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(regenerate.closest('header')).toBeTruthy()
  })

  it('lays the actions out the same way on every tool: star, copy, export, new input, then the one primary', async () => {
    getHistoryItemMock.mockResolvedValue(withExportable)
    renderScreen('run-1')
    const regenerate = await screen.findByRole('button', { name: 'Re-generate' })
    expect(regenerate.className).toContain('kit-button--primary')
    const actions = regenerate.closest('.result-actions')
    expect(actions?.querySelector('[aria-label="Add to favorites"]')).toBeTruthy()
    expect(actions?.textContent).toContain('Copy')
    expect(actions?.textContent).toContain('Export')
    expect(actions?.querySelectorAll('.kit-button--primary')).toHaveLength(1)
  })

  it('offers plain text, Markdown and (for letters and interviews) PDF in the export menu', async () => {
    getHistoryItemMock.mockResolvedValue(withExportable)
    renderScreen('run-1')
    const trigger = await screen.findByRole('button', { name: 'Export result' })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(await screen.findByRole('menuitem', { name: 'Plain text (.txt)' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Markdown (.md)' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'PDF' })).toBeNull()
  })

  it('ends the report with the next tools from the registry and the run summary note', async () => {
    getHistoryItemMock.mockResolvedValue(savedRun)
    renderScreen('run-1')
    await screen.findByText('A clear headline.')
    const next = screen.getByRole('list', { name: 'What next' })
    expect(next.textContent).toContain('Compare it to a role')
    expect(screen.getByText('Directional.')).toBeTruthy()
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
