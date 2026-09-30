import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '#/lib/api/errors'
import { ApplicationsPage } from '../applications-page'

const api = vi.hoisted(() => ({
  listApplications: vi.fn(),
  getApplicationInsights: vi.fn(),
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
const noInsights = { overall: { applied: 0, replied: 0, reply_rate: null }, min_segment_size: 3, dimensions: [] }
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
    api.getApplicationInsights.mockResolvedValue(noInsights)
  })

  it('groups applications into stage columns with what each one needs next', async () => {
    renderBoard()
    await screen.findByText('Backend Engineer')
    const saved = within(column('Saved'))
    expect(saved.getByText(/Next: Tailor CV/)).toBeTruthy()
    expect(saved.getByLabelText('81% skills fit')).toBeTruthy()
    expect(within(saved.getByText('Platform Engineer').closest('article') as HTMLElement).getByText('Ready to apply')).toBeTruthy()
    expect(within(saved.getByText('Python Developer').closest('article') as HTMLElement).getByText('2 questions')).toBeTruthy()
    expect(within(column('Interviewing')).getByText('SRE')).toBeTruthy()
    expect(within(column('Closed')).getByText('Not selected')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Backend Engineer' }).getAttribute('href')).toBe('/campaigns/a-1')
    expect(screen.getByText('1 ready to apply')).toBeTruthy()
    // The hero shows at most three chips.
    expect(screen.getByText(/\d+ in progress/)).toBeTruthy()
    expect(screen.queryByText(/\d+ offers?$/)).toBeNull()
  })

  it('switches to a list with stage, role, company, fit and next step', async () => {
    renderBoard()
    await screen.findByText('Backend Engineer')
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    const row = screen.getByRole('link', { name: 'Backend Engineer' }).closest('tr') as HTMLElement
    expect(within(row).getByText('Saved')).toBeTruthy()
    expect(within(row).getByText('Northwind')).toBeTruthy()
    expect(within(row).getByText('81%')).toBeTruthy()
    expect(within(row).getByText(/Tailor CV/)).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Next step' })).toBeTruthy()
  })

  it('shows an offers chip next to the interviewing chip, and every non-zero status', async () => {
    const withOffer = [...items, { ...base, id: 'a-6', title: 'Data Engineer', company: 'Fjord', status: 'offer', applied_at: '2026-09-10T10:00:00Z' }]
    api.listApplications.mockResolvedValue({ items: withOffer, total: withOffer.length })
    renderBoard()
    await screen.findByText('Backend Engineer')
    expect(screen.getByText('1 interviewing')).toBeTruthy()
    expect(screen.getByText('1 offer')).toBeTruthy()
    expect(screen.getByText('5 in progress')).toBeTruthy()
  })

  it('offers Mark no reply on a stale applied card and chips every non-zero status', async () => {
    const stale = [
      { ...base, id: 'a-7', title: 'Cloud Engineer', company: 'Vale', status: 'applied', applied_at: '2026-09-01T10:00:00Z', no_reply_suggested: true },
      { ...base, id: 'a-8', title: 'QA Engineer', company: 'Dune', status: 'no_reply', applied_at: '2026-08-01T10:00:00Z' },
    ]
    api.listApplications.mockResolvedValue({ items: stale, total: 2 })
    api.updateApplication.mockResolvedValue({ ...stale[0], status: 'no_reply' })
    renderBoard()
    const card = (await screen.findByText('Cloud Engineer')).closest('article') as HTMLElement
    expect(within(card).getByText('No reply yet?')).toBeTruthy()
    expect(screen.getByText('1 applied')).toBeTruthy()
    expect(screen.getByText('1 no reply')).toBeTruthy()
    const parked = (screen.getByText('QA Engineer')).closest('article') as HTMLElement
    expect(within(parked).queryByText('No reply yet?')).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: 'Mark no reply' }))
    await waitFor(() => expect(api.updateApplication).toHaveBeenCalledWith('a-7', { status: 'no_reply' }))
  })

  it('marks pinned applications on the board', async () => {
    const pinned = [{ ...items[0], is_pinned: true }, ...items.slice(1)]
    api.listApplications.mockResolvedValue({ items: pinned, total: pinned.length })
    renderBoard()
    const card = (await screen.findByText('Backend Engineer')).closest('article') as HTMLElement
    expect(within(card).getByLabelText('Pinned')).toBeTruthy()
    const other = screen.getByText('Platform Engineer').closest('article') as HTMLElement
    expect(within(other).queryByLabelText('Pinned')).toBeNull()
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
    expect(await screen.findByText(/No applications yet/)).toBeTruthy()
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

  it('hints at the missing keyword while keeping the button enabled', async () => {
    api.getApplicationPreferences.mockResolvedValue({ ...prefs, keywords: [] })
    renderBoard()
    expect(await screen.findByText('Add at least one keyword so we know which jobs to prepare.')).toBeTruthy()
    const button = screen.getByRole('button', { name: /Prepare applications$/ })
    expect(button.hasAttribute('disabled')).toBe(false)
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
  it('teaches the owner to record outcomes when nothing has been applied to yet', async () => {
    renderBoard()
    expect(await screen.findByText('Nothing to learn from yet.')).toBeTruthy()
    expect(screen.getByText(/mark it No reply/)).toBeTruthy()
  })

  it("shows reply rates with their sample size, and 'not enough data' for thin segments", async () => {
    api.getApplicationInsights.mockResolvedValue({
      overall: { applied: 8, replied: 3, reply_rate: 38 },
      min_segment_size: 3,
      dimensions: [
        {
          key: 'work_mode', title: 'Remote or on-site', hidden_count: 0,
          segments: [
            { label: 'Remote', applied: 5, replied: 3, reply_rate: 60, enough_data: true },
            { label: 'On-site', applied: 2, replied: 0, reply_rate: null, enough_data: false },
          ],
        },
        { key: 'company', title: 'Company', hidden_count: 4, segments: [] },
      ],
    })
    renderBoard()
    expect(await screen.findByText('3 of 8 applications got a reply')).toBeTruthy()
    const group = within(screen.getByRole('region', { name: 'Remote or on-site' }))
    expect(group.getByText('Remote')).toBeTruthy()
    expect(group.getByText('60%')).toBeTruthy()
    expect(group.getByLabelText('60%, 3 of 5 applications')).toBeTruthy()
    expect(group.getByText('n=5')).toBeTruthy()
    expect(group.getByLabelText('Not enough data, 2 applications').textContent).toBe('—n=2')
    expect(screen.queryByRole('region', { name: 'Company' })).toBeNull()
  })
})
