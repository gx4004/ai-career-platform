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
const session = vi.hoisted(() => ({ status: 'authenticated' as string }))
vi.mock('#/hooks/useSession', () => ({ useSession: () => ({ status: session.status }) }))
const createApi = vi.hoisted(() => ({ createApplication: vi.fn(), listApplicationEvents: vi.fn() }))
vi.mock('#/components/applications/applicationsApi', () => createApi)
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
const column = (name: string) => screen.getByRole('heading', { name: new RegExp(`^${name}\\b`), level: 2 }).closest('section') as HTMLElement
async function moveTo(title: string, target: string) {
  fireEvent.keyDown(await screen.findByRole('button', { name: `Move ${title}` }), { key: 'Enter' })
  fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: target }))
}

describe('ApplicationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    session.status = 'authenticated'
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
    expect(screen.getByText(/\d+ in progress/)).toBeTruthy()
    expect(screen.queryByText(/\d+ offers?$/)).toBeNull()
  })

  it('switches to a list with stage, role, company, fit and next step', async () => {
    renderBoard()
    await screen.findByText('Backend Engineer')
    fireEvent.click(screen.getByRole('radio', { name: 'List' }))
    const row = screen.getByRole('link', { name: 'Backend Engineer' }).closest('tr') as HTMLElement
    expect(within(row).getByText('Saved')).toBeTruthy()
    expect(within(row).getByText('Northwind')).toBeTruthy()
    expect(within(row).getByRole('img', { name: '81% fit' })).toBeTruthy()
    expect(within(row).getByText(/Tailor CV/)).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Next step' })).toBeTruthy()
  })

  it('keeps the Board/List toggle apart from the stage switcher on a phone, one stage at a time', async () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query.includes('max-width: 767px'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia
    try {
      renderBoard()
      await screen.findByText('Backend Engineer')
      const view = screen.getByRole('radiogroup', { name: 'View' })
      expect(within(view).getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['Board', 'List'])
      const stages = screen.getByRole('radiogroup', { name: 'Stage' })
      expect(within(stages).getAllByRole('radio').map((radio) => radio.textContent)).toEqual([
        'Saved 3', 'Applied 0', 'Interviewing 1', 'Offer 0', 'Closed 1',
      ])
      // Only the chosen stage is on screen.
      expect(screen.queryByText('SRE')).toBeNull()
      fireEvent.click(within(stages).getByRole('radio', { name: /^Interviewing/ }))
      expect(await screen.findByText('SRE')).toBeTruthy()
      expect(screen.queryByText('Backend Engineer')).toBeNull()
      fireEvent.click(within(view).getByRole('radio', { name: 'List' }))
      expect(screen.getByRole('columnheader', { name: 'Next step' })).toBeTruthy()
      // The stages only make sense on the board; going back restores the stage you were on.
      expect(screen.queryByRole('radiogroup', { name: 'Stage' })).toBeNull()
      fireEvent.click(within(view).getByRole('radio', { name: 'Board' }))
      expect(await screen.findByText('SRE')).toBeTruthy()
    } finally {
      window.matchMedia = original
    }
  })

  it('says what a column is for when it is empty, in the dashed slot a card would take', async () => {
    renderBoard()
    await screen.findByText('Backend Engineer')
    const hint = within(column('Offer')).getByText('Offers on the table')
    expect(hint.closest('.kit-empty')?.getAttribute('data-variant')).toBe('slot')
  })

  it('waits like loading, without an error, while a signed-in browser cannot reach the server', async () => {
    session.status = 'unreachable'
    api.listApplications.mockRejectedValue(new ApiError('Network error', 0))
    renderBoard()
    await waitFor(() => expect(api.listApplications).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.getByText('Loading applications')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText(/couldn't be loaded/)).toBeNull()
    expect(screen.queryByRole('button', { name: "What's working" })).toBeNull()
  })

  it('adds What\'s working and Prepare under the board only once their data is in, so nothing is pushed down', async () => {
    let answer: (value: unknown) => void = () => undefined
    api.getApplicationInsights.mockReturnValue(new Promise((resolve) => { answer = resolve }))
    renderBoard()
    await screen.findByText('Backend Engineer')
    expect(screen.queryByRole('button', { name: "What's working" })).toBeNull()
    expect(screen.queryByRole('heading', { name: /Prepare applications/ })).toBeNull()
    answer(noInsights)
    expect(await screen.findByRole('button', { name: "What's working" })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: /Prepare applications/ })).toBeTruthy()
  })

  it('keeps the header to in-progress and ready counts; stage counts live in the board columns', async () => {
    const withOffer = [...items, { ...base, id: 'a-6', title: 'Data Engineer', company: 'Fjord', status: 'offer', applied_at: '2026-09-10T10:00:00Z' }]
    api.listApplications.mockResolvedValue({ items: withOffer, total: withOffer.length })
    renderBoard()
    await screen.findByText('Backend Engineer')
    expect(screen.queryByText('1 interviewing')).toBeNull()
    expect(screen.queryByText('1 offer')).toBeNull()
    expect(screen.getByText('5 in progress')).toBeTruthy()
  })

  it('offers Mark no reply on a stale applied card', async () => {
    const stale = [
      { ...base, id: 'a-7', title: 'Cloud Engineer', company: 'Vale', status: 'applied', applied_at: '2026-09-01T10:00:00Z', no_reply_suggested: true },
      { ...base, id: 'a-8', title: 'QA Engineer', company: 'Dune', status: 'no_reply', applied_at: '2026-08-01T10:00:00Z' },
    ]
    api.listApplications.mockResolvedValue({ items: stale, total: 2 })
    api.updateApplication.mockResolvedValue({ ...stale[0], status: 'no_reply' })
    renderBoard()
    const card = (await screen.findByText('Cloud Engineer')).closest('article') as HTMLElement
    expect(within(card).getByText('No reply yet?')).toBeTruthy()
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

  it('offers No reply only for an application that is still Applied', async () => {
    const mixed = [
      { ...base, id: 'n-1', title: 'Cloud Engineer', company: 'Vale', status: 'applied', applied_at: '2026-09-01T10:00:00Z' },
      ...items,
    ]
    api.listApplications.mockResolvedValue({ items: mixed, total: mixed.length })
    renderBoard()
    fireEvent.keyDown(await screen.findByRole('button', { name: 'Move Backend Engineer' }), { key: 'Enter' })
    expect(within(await screen.findByRole('menu')).queryByRole('menuitem', { name: 'No reply' })).toBeNull()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    fireEvent.keyDown(screen.getByRole('button', { name: 'Move Cloud Engineer' }), { key: 'Enter' })
    expect(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'No reply' })).toBeTruthy()
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

  it('walks a first-time owner into their first job with a lemon card', async () => {
    api.listApplications.mockResolvedValue({ items: [], total: 0 })
    renderBoard()
    expect(await screen.findByRole('heading', { name: 'Add your first job' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Find a job in Discover/ }).getAttribute('href')).toBe('/discovery')
    expect(screen.getByRole('button', { name: 'Add a job by hand' })).toBeTruthy()
    // One filled button for the view: the card's, not the header's.
    expect(screen.getByRole('link', { name: 'Find jobs' }).className).not.toContain('kit-button--primary')
  })

  it('marks a date inside a week, or past, with a rose chip on the card', async () => {
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString()
    const dated = [
      { ...items[1], id: 'd-1', deadline: day(2) },
      { ...items[2], id: 'd-2', deadline: day(-3) },
      { ...items[0], id: 'd-3', deadline: day(30), next_task: null },
    ]
    api.listApplications.mockResolvedValue({ items: dated, total: 3 })
    renderBoard()
    const soon = (await screen.findByText('Platform Engineer')).closest('article') as HTMLElement
    expect(within(soon).getByText('Due in 2 days').closest('.kit-badge')?.getAttribute('data-tone')).toBe('rose')
    const late = screen.getByText('Python Developer').closest('article') as HTMLElement
    expect(within(late).getByText('Overdue')).toBeTruthy()
    const far = screen.getByText('Backend Engineer').closest('article') as HTMLElement
    expect(within(far).queryByText(/^Due/)).toBeNull()
  })

  it('opens the list on what to do next, soonest date first with closed ones last, and sorts by any column', async () => {
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString()
    const rows = [
      { ...base, id: 'l-1', title: 'Zeta Role', company: 'Zed', status: 'saved' },
      { ...base, id: 'l-2', title: 'Alpha Role', company: 'Ay', status: 'rejected' },
      { ...base, id: 'l-3', title: 'Mid Role', company: 'Em', status: 'saved', deadline: day(5) },
      { ...base, id: 'l-4', title: 'Soon Role', company: 'Es', status: 'saved', deadline: day(1) },
    ]
    api.listApplications.mockResolvedValue({ items: rows, total: rows.length })
    renderBoard()
    await screen.findByText('Soon Role')
    fireEvent.click(screen.getByRole('radio', { name: 'List' }))
    const names = () => within(screen.getByRole('table')).getAllByRole('link').map((link) => link.textContent)
    expect(names()).toEqual(['Soon Role', 'Mid Role', 'Zeta Role', 'Alpha Role'])
    expect(screen.getByRole('columnheader', { name: /Next step/ }).getAttribute('aria-sort')).toBe('ascending')

    fireEvent.click(within(screen.getByRole('columnheader', { name: /^Role/ })).getByRole('button'))
    expect(names()).toEqual(['Alpha Role', 'Mid Role', 'Soon Role', 'Zeta Role'])
  })
})

describe('Add a job by hand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.listApplications.mockResolvedValue({ items, total: items.length })
    api.getApplicationPreferences.mockResolvedValue(prefs)
    api.getApplicationInsights.mockResolvedValue(noInsights)
  })

  const created = {
    ...base, id: 'new-1', title: 'Data Engineer', company: 'Fjord', role: 'Data Engineer', status: 'saved',
    created_at: '2026-10-06T10:00:00Z', listing: null, events: [], events_total: 1, tasks: [],
  }

  it('adds a job from a dialog and puts it in Saved', async () => {
    createApi.createApplication.mockResolvedValue(created)
    renderBoard()
    await screen.findByText('Backend Engineer')
    fireEvent.click(screen.getByRole('button', { name: 'Add a job by hand' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a job by hand' })
    fireEvent.change(within(dialog).getByLabelText('Role'), { target: { value: ' Data Engineer ' } })
    fireEvent.change(within(dialog).getByLabelText('Company'), { target: { value: 'Fjord' } })
    fireEvent.change(within(dialog).getByLabelText(/Link to the posting/), { target: { value: 'https://jobs.example/1' } })
    fireEvent.change(within(dialog).getByLabelText(/Apply by/), { target: { value: '2026-10-20' } })
    // The board refetches after the write; the server then lists the new job too.
    api.listApplications.mockResolvedValue({ items: [created, ...items], total: items.length + 1 })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add to Saved' }))

    await waitFor(() => expect(createApi.createApplication).toHaveBeenCalledTimes(1))
    const payload = createApi.createApplication.mock.calls[0][0]
    expect(payload).toMatchObject({ role: 'Data Engineer', company: 'Fjord', source_url: 'https://jobs.example/1', description: null })
    expect(new Date(payload.deadline).getDate()).toBe(20)
    await waitFor(() => expect(within(column('Saved')).getByText('Data Engineer')).toBeTruthy())
    expect(screen.getByText(/Added Data Engineer at Fjord to Saved/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open it' }).getAttribute('href')).toBe('/campaigns/new-1')
  })

  it('says in plain words what is missing before anything is sent', async () => {
    renderBoard()
    await screen.findByText('Backend Engineer')
    fireEvent.click(screen.getByRole('button', { name: 'Add a job by hand' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a job by hand' })
    fireEvent.change(within(dialog).getByLabelText(/Link to the posting/), { target: { value: 'jobs.example' } })
    fireEvent.change(within(dialog).getByLabelText(/Job description/), { target: { value: 'too short' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add to Saved' }))

    expect(await within(dialog).findByText(/Enter the role/)).toBeTruthy()
    expect(within(dialog).getByText('Enter the company you are applying to.')).toBeTruthy()
    expect(within(dialog).getByText(/starting with https:\/\//)).toBeTruthy()
    expect(within(dialog).getByText(/at least 20 characters/)).toBeTruthy()
    expect(createApi.createApplication).not.toHaveBeenCalled()
    await waitFor(() => expect(document.activeElement?.id).toBe('add-application-role'))
  })

  it('moves focus to the first field the server refused', async () => {
    createApi.createApplication.mockRejectedValue(
      new ApiError('Check the link.', 422, undefined, { fields: { source_url: 'Invalid URL' } }),
    )
    renderBoard()
    await screen.findByText('Backend Engineer')
    fireEvent.click(screen.getByRole('button', { name: 'Add a job by hand' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a job by hand' })
    fireEvent.change(within(dialog).getByLabelText('Role'), { target: { value: 'Data Engineer' } })
    fireEvent.change(within(dialog).getByLabelText('Company'), { target: { value: 'Fjord' } })
    fireEvent.change(within(dialog).getByLabelText(/Link to the posting/), { target: { value: 'https://bad' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add to Saved' }))

    expect(await within(dialog).findByText(/starting with https:\/\//)).toBeTruthy()
    await waitFor(() => expect(document.activeElement?.id).toBe('add-application-source_url'))
  })

  it("shows the server's refusal inside the dialog", async () => {
    createApi.createApplication.mockRejectedValue(new ApiError('Something went wrong on our side. Try again in a moment.', 500))
    renderBoard()
    await screen.findByText('Backend Engineer')
    fireEvent.click(screen.getByRole('button', { name: 'Add a job by hand' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a job by hand' })
    fireEvent.change(within(dialog).getByLabelText('Role'), { target: { value: 'Data Engineer' } })
    fireEvent.change(within(dialog).getByLabelText('Company'), { target: { value: 'Fjord' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add to Saved' }))
    expect((await within(dialog).findByRole('alert')).textContent).toContain('Something went wrong on our side')
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

  it('sends the owner to the profile when nothing is confirmed there yet', async () => {
    await prepare({ reason: 'no_evidence' })
    expect(await screen.findByText(/Confirm some evidence in your profile first/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open your profile' }).getAttribute('href')).toBe('/profile')
    expect(screen.queryByText(/No new jobs match/)).toBeNull()
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
    // Folded until there is something to read: a first-time visitor sees the board and the form first.
    const toggle = await screen.findByRole('button', { name: "What's working" })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Nothing to learn from yet.')).toBeNull()
    fireEvent.click(toggle)
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
    expect(group.getByText('Not enough data yet: On-site (2)')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Company' })).toBeNull()
  })
})
