import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HistoryPage, type HistorySearchState } from '#/components/history/HistoryPage'

const updateHistoryItemMock = vi.hoisted(() => vi.fn())
const refetchMock = vi.hoisted(() => vi.fn())
const state = vi.hoisted(() => ({
  items: [] as unknown[],
  total: 0,
  isError: false,
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
  useSession: () => ({ status: 'authenticated', openAuthDialog: vi.fn() }),
}))
vi.mock('#/hooks/useFavoriteToggle', () => ({
  useFavoriteToggle: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('#/hooks/useHistory', () => ({
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
    updateHistoryItemMock.mockReset().mockResolvedValue({ ...baseRun, label: 'Renamed' })
    refetchMock.mockReset()
  })

  it('shows a PageHero with run and starred counts', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'History' })).toBeTruthy()
    expect(screen.getByText('1 run')).toBeTruthy()
    expect(screen.getByText('1 starred')).toBeTruthy()
  })

  it('renders each run with a real Open link and no leaked identifiers', () => {
    renderPage()
    const open = screen.getByRole('link', { name: 'Open My resume run' })
    expect(open.getAttribute('href')).toBe('/resume/result/run-1')
    expect(screen.queryByText('v1')).toBeNull()
    expect(screen.queryByText(/abcdef12/)).toBeNull()
    expect(screen.queryByText(/Latest artifact/)).toBeNull()
    expect(screen.getByText('Solid baseline')).toBeTruthy()
  })

  it('does not nest buttons inside a link', () => {
    renderPage()
    for (const link of screen.getAllByRole('link')) {
      expect(within(link).queryAllByRole('button')).toHaveLength(0)
    }
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

  it('groups the tool pills and marks the active one pressed', () => {
    renderPage({ tool: 'resume' })
    const group = screen.getByRole('group', { name: 'Filter by tool' })
    expect(within(group).getByRole('button', { name: 'Resume' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(group).getByRole('button', { name: 'Match' }).getAttribute('aria-pressed')).toBe('false')
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

  it('links to Applications', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'Open Applications' }).getAttribute('href')).toBe('/campaigns')
  })

  it('labels the search field', () => {
    renderPage()
    expect(screen.getByRole('searchbox', { name: /search saved runs/i })).toBeTruthy()
  })

  it('shows a filtered empty state with a secondary Clear filters button and no Resume CTA', () => {
    state.items = []
    state.total = 0
    renderPage({ tool: 'career' })
    expect(screen.getByText('No runs match these filters')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Start with Resume' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Clear filters' }).length).toBeGreaterThan(0)
  })

  it('shows the first-run empty state with a single Resume action', () => {
    state.items = []
    state.total = 0
    renderPage()
    expect(screen.getByRole('link', { name: 'Start with Resume' })).toBeTruthy()
  })

  it('offers a retry when loading fails', () => {
    state.isError = true
    state.items = []
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetchMock).toHaveBeenCalled()
  })

  it('does not link older application drafts or CV Studio runs back to /history', () => {
    state.items = [
      { ...baseRun, id: 'd1', tool_name: 'application-drafts', label: 'Draft', workspace: { id: 'ws-9', label: 'Acme', is_pinned: false } },
      { ...baseRun, id: 'c1', tool_name: 'cv-quality', label: 'Old check' },
    ]
    renderPage()
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).not.toContain('/history')
    expect(hrefs).toContain('/campaigns/ws-9')
    expect(screen.getByText('Application')).toBeTruthy()
    expect(screen.getByText('Workspace: Acme')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Open Old check' })).toBeNull()
  })

  it('omits the Workspace line when it repeats the run label', () => {
    state.items = [{ ...baseRun, workspace: { id: 'w', label: 'My resume run', is_pinned: false } }]
    renderPage()
    expect(screen.queryByText(/Workspace:/)).toBeNull()
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
})
