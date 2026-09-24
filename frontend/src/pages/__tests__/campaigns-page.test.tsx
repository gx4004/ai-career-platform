import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CampaignsPage } from '../campaigns-page'

const api = vi.hoisted(() => ({ getHistoryWorkspaces: vi.fn(), updateHistoryWorkspace: vi.fn() }))
vi.mock('#/lib/api/client', () => api)
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children, className }: { to: string; params?: { campaignId?: string }; children: React.ReactNode; className?: string }) => (
    <a href={params?.campaignId ? to.replace('$campaignId', params.campaignId) : to} className={className}>{children}</a>
  ),
}))

const base = {
  label: null, is_pinned: false, deadline: null, listing: null, linked_run_ids: [], last_active_tool: null,
  last_active_result_id: null, updated_at: '2026-09-20T10:00:00Z', next_task: null, last_activity_at: null,
}
const items = [
  { ...base, id: 'c-1', role: 'Backend Engineer', company: 'Northwind', status: null, next_task: { title: 'Tailor CV', deadline: '2026-09-30T12:00:00Z' } },
  { ...base, id: 'c-2', role: 'Platform Engineer', company: 'Harbor', status: 'preparing' },
  { ...base, id: 'c-3', role: 'Data Engineer', company: 'Tidewater', status: 'applied', deadline: '2026-10-02T12:00:00Z' },
  { ...base, id: 'c-4', role: 'SRE', company: 'Lumen', status: 'interviewing' },
  { ...base, id: 'c-5', role: 'ML Engineer', company: 'Quarry', status: 'rejected' },
  // A plain tool-run workspace with no job attached stays off the board.
  { ...base, id: 'c-6', label: 'Resume Analysis (84/100)', role: null, company: null, status: null },
]

function renderBoard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><CampaignsPage /></QueryClientProvider>)
}
function column(name: string) {
  return screen.getByRole('heading', { name, level: 2 }).closest('section') as HTMLElement
}

describe('CampaignsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.getHistoryWorkspaces.mockResolvedValue({ items, total: items.length })
  })

  it('groups applications into pipeline columns with their next step', async () => {
    renderBoard()
    await screen.findByText('Backend Engineer')

    const saved = within(column('Saved'))
    expect(saved.getByText('Backend Engineer')).toBeTruthy()
    expect(saved.getByText('Platform Engineer')).toBeTruthy()
    // A finer status than the column name is shown as a pill.
    expect(saved.getByText('Getting ready')).toBeTruthy()
    expect(saved.getByText('Tailor CV')).toBeTruthy()
    expect(within(column('Applied')).getByText(/Apply by/)).toBeTruthy()
    expect(within(column('Interviewing')).getByText('SRE')).toBeTruthy()
    expect(within(column('Offer')).getByText('Offers on the table')).toBeTruthy()
    expect(within(column('Closed')).getByText('Not selected')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Backend Engineer' }).getAttribute('href')).toBe('/campaigns/c-1')
    expect(screen.queryByText('Resume Analysis (84/100)')).toBeNull()
  })

  it('moves a card to a later stage from its menu', async () => {
    api.updateHistoryWorkspace.mockResolvedValue({ ...items[0], status: 'applied', updated_at: '2026-09-24T10:00:00Z' })
    renderBoard()
    fireEvent.keyDown(await screen.findByRole('button', { name: 'Move Backend Engineer' }), { key: 'Enter' })
    const menu = await screen.findByRole('menu')
    expect(within(menu).queryByRole('menuitem', { name: 'Saved' })).toBeNull()

    // The board refetches after a move; the server now reports the new stage.
    api.getHistoryWorkspaces.mockResolvedValue({ items: [{ ...items[0], status: 'applied' }, ...items.slice(1)], total: items.length })
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Applied' }))

    await waitFor(() => expect(api.updateHistoryWorkspace).toHaveBeenCalledWith('c-1', { status: 'applied' }))
    await waitFor(() => expect(within(column('Applied')).getByText('Backend Engineer')).toBeTruthy())
  })

  it('offers no moves for a closed application', async () => {
    renderBoard()
    const button = await screen.findByRole('button', { name: 'Move ML Engineer' })
    expect(button.hasAttribute('disabled')).toBe(true)
  })

  it('explains a failed move in plain words', async () => {
    api.updateHistoryWorkspace.mockRejectedValueOnce(new Error('409'))
    renderBoard()
    fireEvent.keyDown(await screen.findByRole('button', { name: 'Move SRE' }), { key: 'Enter' })
    fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Offer' }))
    expect((await screen.findByRole('alert')).textContent).toContain('“SRE” couldn\'t be moved')
    expect(within(column('Interviewing')).getByText('SRE')).toBeTruthy()
  })

  it('shows a friendly empty state when there are no applications', async () => {
    api.getHistoryWorkspaces.mockResolvedValue({ items: [], total: 0 })
    renderBoard()
    expect(await screen.findByText('No applications yet')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Saved', level: 2 })).toBeNull()
  })
})
