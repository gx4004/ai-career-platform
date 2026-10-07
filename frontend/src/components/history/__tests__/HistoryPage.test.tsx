import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HistoryPage, type HistorySearchState } from '#/components/history/HistoryPage'

const updateHistoryItemMock = vi.hoisted(() => vi.fn())
const deleteHistoryItemMock = vi.hoisted(() => vi.fn())
const refetchMock = vi.hoisted(() => vi.fn())
const state = vi.hoisted(() => ({
  items: [] as unknown[],
  total: 0,
  isError: false,
  status: 'authenticated' as string,
}))

const baseRun = {
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
    primary_recommendation_title: null,
    schema_version: 'v1',
    linked_context_ids: ['abcdef12-0000'],
    next_step_tool: 'job-match',
  },
  workspace: null,
}

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
}))
vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({ status: state.status, openAuthDialog: vi.fn() }),
}))
vi.mock('#/hooks/useFavoriteToggle', () => ({
  useFavoriteToggle: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('#/hooks/useHistory', () => ({
  HISTORY_PAGE_SIZE: 10,
  useHistory: () => ({
    data: { items: state.items, total: state.total, page: 1, page_size: 10, has_more: false },
    isPending: false,
    isError: state.isError,
    refetch: refetchMock,
  }),
}))
vi.mock('#/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/api/client')>()),
  updateHistoryItem: updateHistoryItemMock,
  deleteHistoryItem: deleteHistoryItemMock,
}))

function renderPage(search: HistorySearchState = {}, onSearchChange = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <HistoryPage search={search} onSearchChange={onSearchChange} />
    </QueryClientProvider>,
  )
  return onSearchChange
}

describe('HistoryPage', () => {
  beforeEach(() => {
    state.items = [baseRun]
    state.total = 1
    state.isError = false
    state.status = 'authenticated'
    updateHistoryItemMock.mockReset().mockResolvedValue({ ...baseRun, label: 'Renamed' })
    deleteHistoryItemMock.mockReset().mockResolvedValue(undefined)
    refetchMock.mockReset()
  })

  it('asks a known guest to sign in', () => {
    state.status = 'guest'
    renderPage()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
  })

  it.each(['loading', 'unreachable'])('never shows the guest prompt while the session is %s', (status) => {
    state.status = status
    renderPage()
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull()
    expect(screen.queryByText('Pick up where you left off')).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'History' })).toBeTruthy()
  })

  it('shows the page title with the run count', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'History' })).toBeTruthy()
    expect(screen.getByText('1 run')).toBeTruthy()
  })

  it('renders each run as a link to its result, with the tool and sentence underneath and no leaked identifiers', () => {
    renderPage()
    const open = screen.getByRole('link', { name: 'My resume run' })
    expect(open.getAttribute('href')).toBe('/resume/result/run-1')
    expect(screen.queryByText('v1')).toBeNull()
    expect(screen.queryByText(/abcdef12/)).toBeNull()
    expect(screen.queryByText(/Latest artifact/)).toBeNull()
    expect(screen.getByText('Solid baseline')).toBeTruthy()
  })

  // history-profile-F34: the tool's full name, as the filter Select on the same page says it ('Resume' alone was the
  // registry's short label; 'Match' under a renamed Job Match run did not say which tool it was).
  it('says the tool once, by its full name, underneath a label that does not name it', () => {
    state.items = [{ ...baseRun, label: 'Backend application' }]
    renderPage()
    expect(within(screen.getByRole('list', { name: 'Saved runs' })).getByText('Resume Analyzer')).toBeTruthy()
  })

  it('names a renamed Job Match run\'s tool in full', () => {
    state.items = [{ ...baseRun, tool_name: 'job-match', label: 'Harbor Freight resume check' }]
    renderPage()
    const list = screen.getByRole('list', { name: 'Saved runs' })
    expect(within(list).getByText('Job Match')).toBeTruthy()
    expect(within(list).queryByText('Match')).toBeNull()
  })

  // history-profile-F33: History has no sort, so its Filters sheet must not promise one.
  it('describes the phone Filters sheet by what it can do', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const sheet = await screen.findByRole('dialog')
    expect(sheet.getAttribute('aria-describedby')).toBeTruthy()
    expect(document.getElementById(sheet.getAttribute('aria-describedby') as string)?.textContent).toBe(
      'Show runs from one tool, or only starred ones.',
    )
  })

  // history-profile-F32: never the search field (a phone raises its keyboard over the list); the row that took its place.
  it('after a delete moves focus to the run that took the deleted one\'s place, not into the search field', async () => {
    const second = { ...baseRun, id: 'run-2', label: 'Second run' }
    state.items = [baseRun, second]
    state.total = 2
    deleteHistoryItemMock.mockImplementation(async () => {
      state.items = [second]
      state.total = 1
    })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Delete My resume run' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete run' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Second run' })))
  })

  it('after deleting the last run on the page moves focus to the page title', async () => {
    deleteHistoryItemMock.mockImplementation(async () => {
      state.items = []
      state.total = 0
    })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Delete My resume run' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete run' }))

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'History' })))
  })

  it('does not repeat the tool when the label already names it', () => {
    state.items = [{ ...baseRun, label: 'Resume Analysis (77/100)' }]
    renderPage()
    expect(within(screen.getByRole('list', { name: 'Saved runs' })).queryByText('Resume')).toBeNull()
  })

  it('marks a starred run next to its label', () => {
    state.items = [{ ...baseRun, is_favorite: true }]
    renderPage()
    // consistency-F28: the toggle keeps its name ("Star <run>"); aria-pressed says it is starred.
    expect(screen.getByRole('button', { name: 'Star My resume run', pressed: true })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Remove star from / })).toBeNull()
    expect(screen.getByRole('link', { name: 'My resume run' }).closest('li')?.querySelector('.history-row__star')).toBeTruthy()
  })

  it('does not nest buttons inside a link', () => {
    renderPage()
    for (const link of screen.getAllByRole('link')) {
      expect(within(link).queryAllByRole('button')).toHaveLength(0)
    }
  })

  it('keeps the next-step action out of the hover-revealed group', () => {
    renderPage()
    const row = screen.getByRole('link', { name: 'My resume run' }).closest('li') as HTMLElement
    const next = within(row).getByRole('button', { name: 'Continue: Match' })
    expect(next.closest('.kit-row__reveal')).toBeNull()
    expect(within(row).getByRole('button', { name: /^Star / }).closest('.kit-row__reveal')).toBeTruthy()
    expect(next.closest('.kit-row__actions')?.getAttribute('data-reveal')).toBeNull()
  })

  it('hides pagination when there is a single page', () => {
    renderPage()
    expect(screen.queryByRole('navigation', { name: 'History pages' })).toBeNull()
  })

  it('shows pagination when there are several pages', () => {
    state.total = 25
    renderPage()
    expect(screen.getByText('Page 1 of 3')).toBeTruthy()
  })

  it('offers the tools as one radio group and marks the active one checked', () => {
    renderPage({ tool: 'resume' })
    const group = screen.getByRole('radiogroup', { name: 'Filter by tool' })
    expect(within(group).getByRole('radio', { name: 'Resume Analyzer' }).getAttribute('aria-checked')).toBe('true')
    expect(within(group).getByRole('radio', { name: 'Job Match' }).getAttribute('aria-checked')).toBe('false')
  })

  it('selects a tool, and clicking the selected one clears it', () => {
    const onChange = renderPage({ tool: 'resume' })
    fireEvent.click(screen.getByRole('radio', { name: 'Job Match' }))
    expect(onChange).toHaveBeenCalledWith({ tool: 'job-match', page: 1 })
    fireEvent.click(screen.getByRole('radio', { name: 'Resume Analyzer' }))
    expect(onChange).toHaveBeenCalledWith({ tool: undefined, page: 1 })
  })

  // "Starred", the one word app-wide for kept results (consistency-F11; was "Favorites").
  it('toggles Starred as a pressed button beside the tool filter', () => {
    const onChange = renderPage()
    const favorites = screen.getByRole('button', { name: 'Starred' })
    expect(favorites.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(favorites)
    expect(onChange).toHaveBeenCalledWith({ favorite: true, page: 1 })
  })

  it('hides the run count while there is nothing to count', () => {
    state.items = []
    state.total = 0
    renderPage()
    expect(screen.queryByText('0 runs')).toBeNull()
  })

  it('shows Clear filters only when a filter is set, and clears them', () => {
    const onChange = renderPage({ tool: 'resume', favorite: true, q: 'x' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0])
    expect(onChange).toHaveBeenCalledWith({ tool: undefined, favorite: undefined, q: undefined, page: 1 })
  })

  it('offers no Clear filters without filters', () => {
    renderPage()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()
  })

  it('labels the search field', () => {
    renderPage()
    expect(screen.getByRole('searchbox', { name: /search saved runs/i })).toBeTruthy()
  })

  // Clear filters now sits in the header line beside "0 matches" (it used to be repeated as the empty state's button).
  it('shows a filtered empty state with Clear filters beside the count and no Resume CTA', () => {
    state.items = []
    state.total = 0
    renderPage({ tool: 'career' })
    expect(screen.getByText('No runs match these filters')).toBeTruthy()
    expect(screen.getByText('0 matches')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Start with Resume' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Clear filters' }).length).toBeGreaterThan(0)
  })

  it('shows the first-run empty state with a single Resume action', () => {
    state.items = []
    state.total = 0
    renderPage()
    expect(screen.getByRole('link', { name: 'Start with Resume' })).toBeTruthy()
    // Nothing to search or filter yet.
    expect(screen.queryByRole('searchbox')).toBeNull()
    // consistency-F19: no blank meta line under the title (the placeholder only holds the toolbar still), so the
    // empty state starts where it does on every other empty page.
    expect(document.querySelector('.kit-page-header__meta')).toBeNull()
  })

  it('leaves a page past the end for the last page that has runs, never showing the first-run copy', () => {
    state.items = []
    state.total = 12
    const onChange = renderPage({ page: 9 })
    expect(screen.queryByText('No runs yet')).toBeNull()
    expect(onChange).toHaveBeenCalledWith({ page: 2 }, { replace: true })
  })

  // Only words were typed, no filter is set: the empty state talks about the search, not about filters (it used to say
  // "No runs match these filters" and offer "Clear filters").
  it('shows a search-only empty state that names the search and offers Clear search, and no Filters badge', () => {
    state.items = []
    state.total = 0
    const onChange = renderPage({ q: 'zzzz' })
    expect(screen.getByText('No runs match “zzzz”')).toBeTruthy()
    expect(screen.getByText('Try another word, or clear the search.')).toBeTruthy()
    expect(screen.queryByText('No runs match these filters')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(onChange).toHaveBeenCalledWith({ tool: undefined, favorite: undefined, q: undefined, page: 1 })
  })

  it('puts Clear filters in the header line beside the count, so the toolbar row never grows a line for it', () => {
    const onChange = renderPage({ tool: 'resume' })
    const header = document.querySelector('.kit-page-header') as HTMLElement
    expect(within(header).getByText('1 match')).toBeTruthy()
    fireEvent.click(within(header).getByRole('button', { name: 'Clear filters' }))
    expect(onChange).toHaveBeenCalledWith({ tool: undefined, favorite: undefined, q: undefined, page: 1 })
    // On a fine-pointer desktop the toolbar has no second Clear filters link of its own.
    expect(document.querySelector('.kit-toolbar .kit-toolbar__clear')).toBeNull()
  })

  it('says why a delete failed inside the dialog, and keeps it open', async () => {
    deleteHistoryItemMock.mockRejectedValue(new Error('The run could not be deleted.'))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Delete My resume run' }))
    const dialog = screen.getByRole('alertdialog')
    // The run name sits in typographic quotes, like the rest of the UI.
    expect(dialog.textContent).toContain('“My resume run” will be permanently removed')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete run' }))
    expect((await within(dialog).findByRole('alert')).textContent).toContain('The run could not be deleted.')
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Delete My resume run' }))
    expect(within(screen.getByRole('alertdialog')).queryByRole('alert')).toBeNull()
  })

  it('offers a retry when loading fails', () => {
    state.isError = true
    state.items = []
    renderPage()
    // Same words as the profile's error: the kit's "Try again" and a typographic apostrophe (was "Retry").
    expect(screen.getByText('We couldn’t load your history')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refetchMock).toHaveBeenCalled()
  })

  it('does not link older application drafts or CV Studio runs back to /history', () => {
    state.items = [
      { ...baseRun, id: 'd1', tool_name: 'application-drafts', label: 'Draft', workspace: { id: 'ws-9', label: 'Acme', is_pinned: false, status: 'saved' } },
      { ...baseRun, id: 'c1', tool_name: 'cv-quality', label: 'Old check' },
    ]
    renderPage()
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).not.toContain('/history')
    expect(hrefs).toContain('/campaigns/ws-9')
    expect(screen.getByText('Application')).toBeTruthy()
    expect(screen.getByText('Application: Acme')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Old check' })).toBeNull()
  })

  it('omits the Application line when it repeats the run label', () => {
    state.items = [{ ...baseRun, workspace: { id: 'w', label: 'My resume run', is_pinned: false, status: 'saved' } }]
    renderPage()
    expect(screen.queryByText(/Application:/)).toBeNull()
  })

  it('names only a workspace that targets a job, never the internal one behind a standalone run', () => {
    state.items = [{ ...baseRun, workspace: { id: 'w', label: 'Interview Prep (5 questions)', is_pinned: false } }]
    renderPage()
    expect(screen.queryByText(/Workspace:|Application:/)).toBeNull()
  })

  it('renames a run with Save and cancels with Escape', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Rename My resume run' }))
    const input = screen.getByRole('textbox', { name: 'Rename My resume run' })
    fireEvent.change(input, { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(updateHistoryItemMock).toHaveBeenCalledWith('run-1', 'Renamed'))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: /Rename/ })).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Rename My resume run' }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Rename My resume run' }), { key: 'Escape' })
    expect(screen.queryByRole('textbox', { name: /Rename/ })).toBeNull()
    expect(updateHistoryItemMock).toHaveBeenCalledTimes(1)
  })

  it('keeps Save disabled and saves nothing for an empty or whitespace label', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Rename My resume run' }))
    const input = screen.getByRole('textbox', { name: 'Rename My resume run' })
    const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
    expect(save.disabled).toBe(false)
    for (const value of ['', '   ']) {
      fireEvent.change(input, { target: { value } })
      expect(save.disabled).toBe(true)
      fireEvent.submit(input.closest('form') as HTMLFormElement)
    }
    expect(updateHistoryItemMock).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: ' Fresh name ' } })
    expect(save.disabled).toBe(false)
  })

  it('shows a rename error inline', async () => {
    updateHistoryItemMock.mockRejectedValue(new Error('Nope'))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Rename My resume run' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Nope')
  })

  it('offers the tool filter as a select with the tool names on a phone', () => {
    const matches = vi.fn((query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    vi.stubGlobal('matchMedia', matches)
    try {
      const onChange = renderPage({ tool: 'career' })
      expect(screen.queryByRole('radiogroup', { name: 'Filter by tool' })).toBeNull()
      const select = screen.getByRole('combobox', { name: 'Filter by tool' }) as HTMLSelectElement
      expect(select.value).toBe('career')
      expect(within(select).getByRole('option', { name: 'Interview Q&A' })).toBeTruthy()
      fireEvent.change(select, { target: { value: '' } })
      expect(onChange).toHaveBeenCalledWith({ tool: undefined, page: 1 })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('offers the select, not the six-option control, when the toolbar is too narrow for it (a tablet)', () => {
    // A 656px toolbar (768px tablet beside the rail): the segmented control would wrap onto rows of its own.
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 656 } as DOMRect)
    try {
      renderPage()
      expect(screen.queryByRole('radiogroup', { name: 'Filter by tool' })).toBeNull()
      expect(screen.getByRole('combobox', { name: 'Filter by tool' })).toBeTruthy()
    } finally {
      rect.mockRestore()
    }
  })
})
