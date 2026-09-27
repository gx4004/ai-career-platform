import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '#/lib/api/errors'
import { ApplicationsPage } from '../applications-page'

const api = vi.hoisted(() => ({
  listApplications: vi.fn(),
  updateApplication: vi.fn(),
  getApplicationPreferences: vi.fn(),
  saveApplicationPreferences: vi.fn(),
  prepareApplicationsForMe: vi.fn(),
}))
vi.mock('#/lib/api/client', () => api)
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children, className }: { to: string; params?: { campaignId?: string }; children: React.ReactNode; className?: string }) => (
    <a href={params?.campaignId ? to.replace('$campaignId', params.campaignId) : to} className={className}>{children}</a>
  ),
}))

const base = {
  label: null, deadline: null, applied_at: null, match_score: null, prepared: false, ready: false,
  open_question_count: 0, next_task: null, last_activity_at: null, is_pinned: false, updated_at: '2026-09-20T10:00:00Z',
}
const items = [
  { ...base, id: 'a-1', title: 'Backend Engineer', company: 'Northwind', status: 'saved', match_score: 81, next_task: { title: 'Tailor CV', deadline: '2026-09-30T12:00:00Z' } },
  { ...base, id: 'a-2', title: 'Platform Engineer', company: 'Harbor', status: 'saved', prepared: true, ready: true },
  { ...base, id: 'a-3', title: 'Python Developer', company: 'Tidewater', status: 'saved', prepared: true, open_question_count: 2 },
  { ...base, id: 'a-4', title: 'SRE', company: 'Lumen', status: 'interviewing', applied_at: '2026-09-18T10:00:00Z' },
  { ...base, id: 'a-5', title: 'ML Engineer', company: 'Quarry', status: 'rejected' },
]
const prefs = { keywords: ['backend'], locations: [], remote: true, max_per_run: 5, max_per_run_limit: 10, is_default: false }

function renderBoard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><ApplicationsPage /></QueryClientProvider>)
}
const column = (name: string) => screen.getByRole('heading', { name, level: 2 }).closest('section') as HTMLElement
async function moveTo(title: string, target: string) {
  fireEvent.keyDown(await screen.findByRole('button', { name: `Move ${title}` }), { key: 'Enter' })
  fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: target }))
}

describe('ApplicationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.listApplications.mockResolvedValue({ items, total: items.length })
    api.getApplicationPreferences.mockResolvedValue(prefs)
  })

  it('groups applications into stage columns with what each one needs next', async () => {
    renderBoard()
    await screen.findByText('Backend Engineer')
    const saved = within(column('Saved'))
    expect(saved.getByText('Tailor CV')).toBeTruthy()
    expect(saved.getByText('81% match')).toBeTruthy()
    expect(within(saved.getByText('Platform Engineer').closest('article') as HTMLElement).getByText('Ready to apply')).toBeTruthy()
    expect(within(saved.getByText('Python Developer').closest('article') as HTMLElement).getByText('2 questions')).toBeTruthy()
    expect(within(column('Interviewing')).getByText('SRE')).toBeTruthy()
    expect(within(column('Closed')).getByText('Not selected')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Backend Engineer' }).getAttribute('href')).toBe('/campaigns/a-1')
    expect(screen.getByText('1 ready to apply')).toBeTruthy()
  })

  it('moves a card to Applied, and back again from a closed stage', async () => {
    api.updateApplication.mockResolvedValue({ ...items[0], status: 'applied', applied_at: '2026-09-24T10:00:00Z' })
    renderBoard()
    api.listApplications.mockResolvedValue({ items: [{ ...items[0], status: 'applied' }, ...items.slice(1)], total: items.length })
    await moveTo('Backend Engineer', 'Applied')
    await waitFor(() => expect(api.updateApplication).toHaveBeenCalledWith('a-1', { status: 'applied' }))
    await waitFor(() => expect(within(column('Applied')).getByText('Backend Engineer')).toBeTruthy())

    // Any move is allowed, including out of Closed.
    api.updateApplication.mockResolvedValue({ ...items[4], status: 'interviewing' })
    await moveTo('ML Engineer', 'Interviewing')
    await waitFor(() => expect(api.updateApplication).toHaveBeenCalledWith('a-5', { status: 'interviewing' }))
  })

  it("shows the server's reason when a move is refused", async () => {
    api.updateApplication.mockRejectedValueOnce(new ApiError('Answer the open questions before marking this applied.', 409))
    renderBoard()
    await moveTo('Python Developer', 'Applied')
    expect((await screen.findByRole('alert')).textContent).toContain('Answer the open questions before marking this applied.')
    expect(within(column('Saved')).getByText('Python Developer')).toBeTruthy()
  })

  it('shows a friendly empty state and still offers to prepare applications', async () => {
    api.listApplications.mockResolvedValue({ items: [], total: 0 })
    renderBoard()
    expect(await screen.findByText('No applications yet')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Prepare applications for me' })).toBeTruthy()
  })
})

describe('Prepare applications for me', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.listApplications.mockResolvedValue({ items: [], total: 0 })
    api.getApplicationPreferences.mockResolvedValue(prefs)
  })

  async function prepare(result: Record<string, unknown>) {
    api.prepareApplicationsForMe.mockResolvedValue({ prepared: [], matched_count: 0, skipped_existing_count: 0, max_per_run: 5, ...result })
    renderBoard()
    await screen.findByText('backend')
    fireEvent.click(screen.getByRole('button', { name: /Prepare applications$/ }))
  }

  it('saves keywords as the full preference set', async () => {
    api.saveApplicationPreferences.mockResolvedValue({ ...prefs, keywords: ['backend', 'platform'] })
    renderBoard()
    const input = await screen.findByLabelText('Add keywords')
    fireEvent.change(input, { target: { value: 'platform' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)
    await waitFor(() => expect(api.saveApplicationPreferences).toHaveBeenCalledWith({
      keywords: ['backend', 'platform'], locations: [], remote: true, max_per_run: 5,
    }))
  })

  it('asks for keywords when none are saved', async () => {
    await prepare({ reason: 'no_preferences' })
    expect(await screen.findByText(/Add at least one keyword/)).toBeTruthy()
  })

  it('points to CV Studio when there is no CV yet', async () => {
    await prepare({ reason: 'no_cv' })
    expect((await screen.findByRole('link', { name: 'Create one in CV Studio' })).getAttribute('href')).toBe('/cv-studio')
  })

  it('reports how many applications were prepared and refreshes the board', async () => {
    await prepare({ reason: 'prepared', prepared: [items[1], items[2]], matched_count: 4 })
    expect(await screen.findByText(/Prepared 2 applications/)).toBeTruthy()
    await waitFor(() => expect(api.listApplications).toHaveBeenCalledTimes(2))
  })

  it('says so when nothing new matched', async () => {
    await prepare({ reason: 'prepared', matched_count: 0 })
    expect(await screen.findByText(/No new jobs match your keywords/)).toBeTruthy()
  })
})
