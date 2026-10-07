import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToolResultScreen } from '#/components/tooling/ToolResultScreen'
import { ApiError } from '#/lib/api/errors'
import { clearTransientResults, setTransientResult } from '#/lib/tools/demoRuns'

const getHistoryItemMock = vi.hoisted(() => vi.fn())
const openAuthDialogMock = vi.hoisted(() => vi.fn())
const navigateMock = vi.hoisted(() => vi.fn())
const setFavoriteMock = vi.hoisted(() => vi.fn())
let sessionStatus: 'guest' | 'authenticated' | 'loading' = 'authenticated'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => navigateMock,
    Link: ({ to, children, activeOptions: _active, ...props }: { to: string; children: React.ReactNode; activeOptions?: unknown }) => (
      <a href={to} {...props}>{children}</a>
    ),
  }
})
vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({ status: sessionStatus, openAuthDialog: openAuthDialogMock }),
}))
vi.mock('#/lib/telemetry/client', () => ({ trackTelemetry: vi.fn() }))
// Re-generate first fills in what the account has (a network lookup); here it has nothing to add.
const seedRegenerateMock = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock('#/lib/tools/regenerateSeed', () => ({ seedRegenerate: seedRegenerateMock }))
const exportPdfMock = vi.hoisted(() => vi.fn())
vi.mock('#/lib/tools/exports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/tools/exports')>()),
  exportPdf: exportPdfMock,
}))

vi.mock('#/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/api/client')>()),
  getHistoryItem: getHistoryItemMock,
  setHistoryFavorite: setFavoriteMock,
}))

function renderScreen(historyId: string, toolId: 'resume' | 'job-match' | 'cover-letter' = 'resume') {
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

  // The skeleton is the loaded frame: a facts panel under the seal only where the loaded hero has one (the Resume
  // hero has none, so the page used to lose a card when the run landed), and the actions placeholder takes the
  // header's actions slot (result-actions), so it wraps under the title exactly as the real cluster does.
  it('draws the facts placeholder only for tools whose hero has facts, and the actions in the actions slot', () => {
    getHistoryItemMock.mockReturnValue(new Promise(() => {}))
    const { unmount } = renderScreen('run-1', 'resume')
    expect(document.querySelector('.result-hero__facts')).toBeNull()
    expect(document.querySelector('.kit-page-header .result-actions')).not.toBeNull()
    unmount()
    renderScreen('run-1', 'job-match')
    expect(document.querySelector('.result-hero__facts')).not.toBeNull()
  })

  it('says a deleted run is gone and offers the way back', async () => {
    getHistoryItemMock.mockRejectedValue(new ApiError('Not found', 404))
    renderScreen('run-1')
    expect(await screen.findByRole('heading', { level: 1, name: 'This saved result is no longer available' })).toBeTruthy()
    expect(screen.getByText('It may have been deleted, or it belongs to another account.')).toBeTruthy()
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

  // Sign-off tool-results-F52: a reloaded guest result (or Back to it) lives only in this tab's storage. The server
  // cannot see it, so the first client render must draw what the server drew (the loading frame), not the report;
  // React used to throw the whole tree away with a hydration error.
  it('hydrates a reloaded guest demo without a mismatch, then shows it', async () => {
    sessionStatus = 'guest'
    const item = setTransientResult('resume', { summary: { headline: 'Guest headline' }, overall_score: 64 })
    const stored = window.sessionStorage.getItem(`cw:demo-result:${item.id}`)
    clearTransientResults() // the server: no tab storage, no in-memory run
    const tree = () => (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToolResultScreen toolId="resume" historyId={item.id} />
      </QueryClientProvider>
    )
    const html = renderToString(tree())
    expect(html).not.toContain('This guest demo is no longer available')
    window.sessionStorage.setItem(`cw:demo-result:${item.id}`, stored!) // the reloaded tab still holds it
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)
    const recoverable: unknown[] = []
    let root: ReturnType<typeof hydrateRoot> | undefined
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    try {
      await act(async () => {
        root = hydrateRoot(container, tree(), { onRecoverableError: (error) => recoverable.push(error) })
      })
      expect(recoverable).toEqual([])
      await waitFor(() => expect(container.textContent).toContain('Guest headline'))
      expect(getHistoryItemMock).not.toHaveBeenCalled()
    } finally {
      act(() => root?.unmount())
      container.remove()
    }
  })

  it('shows the expired state for a guest demo that is gone, without a retry', async () => {
    getHistoryItemMock.mockRejectedValue(new ApiError('Not found', 404))
    renderScreen('resume-demo-9')
    expect(await screen.findByRole('heading', { name: 'This guest demo is no longer available' })).toBeTruthy()
    // A demo id only ever lives in its tab: the server is never asked for it (no 401/404 in the console).
    expect(getHistoryItemMock).not.toHaveBeenCalled()
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
    // The open panel says what it is for, and its action is the view's one primary: the header button steps back to
    // secondary (its open look) while the panel is open.
    expect(screen.getByRole('heading', { name: 'Re-generate with feedback' })).toBeTruthy()
    expect(regenerate.className).toContain('kit-button--secondary')
    fireEvent.change(screen.getByLabelText('Re-generate feedback'), { target: { value: 'More numbers' } })
    // "Continue", not "Submit": this opens the tool's form, where the run is started.
    const proceed = screen.getByRole('button', { name: 'Continue' })
    expect(proceed.className).toContain('kit-button--primary')
    fireEvent.click(proceed)
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: '/resume?parent_run_id=run-1' }))
    // Free text stays out of the URL: it waits in this tab for the run it re-generates.
    expect(JSON.parse(window.sessionStorage.getItem('career-workbench:workflow-context') ?? '{}').regenFeedback).toEqual({
      parentRunId: 'run-1',
      text: 'More numbers',
    })
    expect(seedRegenerateMock).toHaveBeenCalledTimes(1)
  })

  it('fills in what the account has before a What next link opens the next tool', async () => {
    getHistoryItemMock.mockResolvedValue(savedRun)
    navigateMock.mockClear()
    seedRegenerateMock.mockClear()
    renderScreen('run-1')
    fireEvent.click(await screen.findByRole('link', { name: 'Open Job Match' }))
    // ?from= names the result it was opened from, so the next tool can say why a field is empty (F48).
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: '/job-match?from=resume' }))
    expect(seedRegenerateMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'run-1' }), 'job-match')
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
    // consistency-F28: one name in both states; aria-pressed carries whether it is starred, and the visible word stays.
    const star = await screen.findByRole('button', { name: 'Star this result' })
    expect(star.getAttribute('aria-pressed')).toBe('true')
    expect(star.textContent).toBe('Star')
    unmount()

    sessionStatus = 'guest'
    const item = setTransientResult('resume', { summary: { headline: 'Guest headline' } })
    renderScreen(item.id)
    const guestStar = await screen.findByRole('button', { name: 'Star this result: sign in first' })
    expect(guestStar.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(guestStar)
    expect(openAuthDialogMock).toHaveBeenCalledWith(expect.objectContaining({ reason: 'save-demo-result' }))
    await waitFor(() => expect(screen.getByText('This result is not saved')).toBeTruthy())
  })

  it('flips the star at once on a saved result read from the server, and keeps it flipped', async () => {
    getHistoryItemMock.mockResolvedValue(savedRun)
    setFavoriteMock.mockResolvedValue({})
    renderScreen('run-1')
    const star = await screen.findByRole('button', { name: 'Star this result' })
    expect(star.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(star)
    expect(screen.getByRole('button', { name: 'Star this result' }).getAttribute('aria-pressed')).toBe('true')
    await waitFor(() => expect(setFavoriteMock).toHaveBeenCalledWith('run-1', true))
    expect(screen.getByRole('button', { name: 'Star this result' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('puts the star back when the server refuses', async () => {
    getHistoryItemMock.mockResolvedValue(savedRun)
    setFavoriteMock.mockRejectedValue(new Error('nope'))
    renderScreen('run-1')
    fireEvent.click(await screen.findByRole('button', { name: 'Star this result' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Star this result' }).getAttribute('aria-pressed')).toBe('false'))
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
    expect(actions?.querySelector('[aria-label="Star this result"]')).toBeTruthy()
    expect(actions?.textContent).toContain('Copy')
    expect(actions?.textContent).toContain('Export')
    expect(actions?.querySelectorAll('.kit-button--primary')).toHaveLength(1)
  })

  describe('header actions by width', () => {
    const realMatchMedia = window.matchMedia
    function viewport(width: number) {
      window.matchMedia = ((query: string) => {
        const max = /max-width:\s*(\d+)px/.exec(query)
        return {
          matches: max ? width <= Number(max[1]) : /prefers-reduced-motion/.test(query),
          media: query,
          onchange: null,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false,
        }
      }) as typeof window.matchMedia
    }
    const names = () =>
      Array.from(document.querySelectorAll('.result-actions .kit-button')).map(
        (b) => b.getAttribute('aria-label') ?? b.textContent?.trim(),
      )
    afterEach(() => {
      window.matchMedia = realMatchMedia
    })

    it('side by side: star, copy, export, new input, then the one primary', async () => {
      viewport(1440)
      getHistoryItemMock.mockResolvedValue(withExportable)
      renderScreen('run-1')
      await screen.findByRole('button', { name: 'Re-generate' })
      expect(names()).toEqual(['Star this result', 'Copy result to clipboard', 'Export result', 'New input', 'Re-generate'])
    })

    // consistency-F13: one order at every width, the order of every page header (Applications and Profile keep their
    // primary last on a phone too). Was primary-first below 860px. The DOM order is the order on screen (WCAG 2.4.3).
    it('stacked (<= 860px): the same order, the one primary last, in the DOM as on screen', async () => {
      viewport(768)
      getHistoryItemMock.mockResolvedValue(withExportable)
      renderScreen('run-1')
      await screen.findByRole('button', { name: 'Re-generate' })
      expect(names()).toEqual(['Star this result', 'Copy result to clipboard', 'Export result', 'New input', 'Re-generate'])
    })

    it('below 360px Star, Copy and Export are icon-only (named by their labels) so they share one row', async () => {
      viewport(320)
      getHistoryItemMock.mockResolvedValue(withExportable)
      renderScreen('run-1')
      await screen.findByRole('button', { name: 'Re-generate' })
      for (const name of ['Star this result', 'Copy result to clipboard', 'Export result']) {
        const button = screen.getByRole('button', { name })
        expect(button.className).toContain('kit-button--icon')
        expect(button.textContent?.trim()).toBe('')
      }
      expect(screen.getByRole('button', { name: 'Re-generate' }).className).not.toContain('kit-button--icon')
    })

    it('Undo after a re-generate is an icon-only ghost, so six actions still fit beside the title', async () => {
      viewport(1440)
      getHistoryItemMock.mockImplementation(async (id: string) =>
        id === 'run-2' ? { ...withExportable, id: 'run-2', parent_run_id: 'run-1' } : withExportable,
      )
      renderScreen('run-2')
      const undo = await screen.findByRole('button', { name: 'Undo: restore previous result' })
      expect(undo.className).toContain('kit-button--icon')
      expect(undo.className).toContain('kit-button--ghost')
      expect(names()).toEqual([
        'Star this result',
        'Copy result to clipboard',
        'Export result',
        'Undo: restore previous result',
        'New input',
        'Re-generate',
      ])
    })

    // Sign-off tool-results-F62: on a stacked header or on touch the tooltip never shows, so Undo says its word.
    // tool-results-F68: the worded Undo (86px) pushed Re-generate onto a row of its own, and the whole report jumped up
    // when Undo hid after 30s. It now sits in the header's meta line as a link that keeps the line's height, so the
    // action rows are the same with and without it. (Was: a worded ghost button in the action cluster.)
    it('Undo carries its word on a stacked header, in the meta line, outside the action rows', async () => {
      viewport(768)
      getHistoryItemMock.mockImplementation(async (id: string) =>
        id === 'run-2' ? { ...withExportable, id: 'run-2', parent_run_id: 'run-1' } : withExportable,
      )
      renderScreen('run-2')
      const undo = await screen.findByRole('button', { name: 'Undo: restore previous result' })
      expect(undo.className).not.toContain('kit-button--icon')
      expect(undo.className).toContain('kit-button--link')
      expect(undo.textContent?.trim()).toBe('Undo')
      expect(undo.closest('.kit-page-header__meta')).not.toBeNull()
      expect(undo.closest('.result-actions')).toBeNull()
      expect(names()).toEqual(['Star this result', 'Copy result to clipboard', 'Export result', 'New input', 'Re-generate'])
    })
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

  it('sends a guest who opens a saved result link to sign in, coming back to the same result', async () => {
    sessionStatus = 'guest'
    getHistoryItemMock.mockRejectedValue(new ApiError('Not authenticated', 401))
    renderScreen('run-1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in to open this result' })).toBeTruthy()
    expect(openAuthDialogMock).toHaveBeenCalledTimes(1)
    expect(openAuthDialogMock).toHaveBeenCalledWith({ to: window.location.pathname, reason: 'open-result' })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(openAuthDialogMock).toHaveBeenCalledTimes(2)
  })

  it('does not send a signed-in person to sign in for a deleted run', async () => {
    getHistoryItemMock.mockRejectedValue(new ApiError('Not found', 404))
    renderScreen('run-1')
    expect(await screen.findByRole('heading', { name: 'This saved result is no longer available' })).toBeTruthy()
    expect(openAuthDialogMock).not.toHaveBeenCalled()
  })

  it('says so on the page when copying fails, and tries again', async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new DOMException('Document is not focused.', 'NotAllowedError')).mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    getHistoryItemMock.mockResolvedValue(savedRun)
    renderScreen('run-1')
    fireEvent.click(await screen.findByRole('button', { name: 'Copy result to clipboard' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('did not let us copy')
    expect(alert.textContent).not.toContain('Document is not focused')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    const copied = await screen.findByRole('button', { name: 'Copied to clipboard' })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(writeText).toHaveBeenCalledTimes(2)
    // Sign-off tool-results-F64: both words (and both icons) stay laid out, one of them hidden, so the button keeps
    // one width and its neighbours do not jump while it says "Copied".
    const shown = (state: string) =>
      Array.from(copied.querySelectorAll(`[data-shown="${state}"]`)).map((el) => el.textContent || el.tagName.toLowerCase())
    expect(shown('true')).toContain('Copied')
    expect(shown('false')).toContain('Copy')
    expect(copied.querySelectorAll('[data-shown]')).toHaveLength(4)
  })

  it('says so on the page when the PDF cannot be made, and tries again', async () => {
    exportPdfMock.mockRejectedValueOnce(new ApiError('Render failed', 503)).mockResolvedValue(undefined)
    const paragraph = { text: 'Paragraph.', why_this_paragraph: 'Why.', requirements_used: [], evidence_used: [] }
    getHistoryItemMock.mockResolvedValue({
      ...savedRun,
      tool_name: 'cover-letter',
      result_payload: {
        schema_version: '1',
        summary: savedRun.result_payload.summary,
        top_actions: [],
        generated_at: '2026-10-03T10:00:00Z',
        download_title: 'Letter',
        exportable_sections: [],
        opening: paragraph,
        body_points: [paragraph],
        closing: paragraph,
        full_text: 'Paragraph.',
        sign_off: '',
      },
    })
    renderScreen('run-1', 'cover-letter')
    const trigger = await screen.findByRole('button', { name: 'Export result' })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'Enter' })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'PDF' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('The PDF could not be made.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(exportPdfMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
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
