import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '#/components/kit'
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
const session = vi.hoisted(() => ({ status: 'authenticated' as string, openAuthDialog: vi.fn() }))
vi.mock('#/hooks/useSession', () => ({ useSession: () => ({ status: session.status, openAuthDialog: session.openAuthDialog }) }))
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
  // The app shell mounts the ToastProvider; a move is confirmed with a toast.
  return render(<QueryClientProvider client={client}><ToastProvider><ApplicationsPage /></ToastProvider></QueryClientProvider>)
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

  // consistency-F25: a guest gets the in-page sign-in gate every signed-in-only page uses (one action), not /login.
  it('shows a guest the in-page sign-in gate with one action, and asks for nothing', () => {
    session.status = 'guest'
    renderBoard()
    expect(screen.getByRole('heading', { name: 'Your applications', level: 1 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Sign in to see your applications' })).toBeTruthy()
    const empty = document.querySelector('.kit-empty') as HTMLElement
    expect([...empty.querySelectorAll('button, a')].map((control) => control.textContent)).toEqual(['Sign in'])
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(session.openAuthDialog).toHaveBeenCalledWith({ to: '/campaigns', reason: 'protected-route' })
    expect(api.listApplications).not.toHaveBeenCalled()
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

  it('holds the Board/List switch in place, disabled, while the board loads, so nothing moves when it arrives', async () => {
    api.listApplications.mockReturnValue(new Promise(() => undefined))
    renderBoard()
    expect(screen.getByText('Loading applications')).toBeTruthy()
    const view = screen.getByRole('radiogroup', { name: 'View' })
    expect(within(view).getAllByRole('radio').every((radio) => (radio as HTMLButtonElement).disabled)).toBe(true)
  })

  it('waits like loading, without an error, while a signed-in browser cannot reach the server', async () => {
    session.status = 'unreachable'
    api.listApplications.mockRejectedValue(new ApiError('Network error', 0))
    renderBoard()
    await waitFor(() => expect(api.listApplications).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.getByText('Loading applications')).toBeTruthy()
    // No alert of the page's own (the ToastProvider's empty announcer is an alert region too).
    expect(screen.queryAllByRole('alert').filter((alert) => !alert.hasAttribute('data-kit-toast-announcer'))).toHaveLength(0)
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
    // The page's own danger notice (the toast region is an empty alert too).
    await waitFor(() =>
      expect(screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('Answer the open questions before marking this applied.'))).toBe(true),
    )
    expect(within(column('Saved')).getByText('Python Developer')).toBeTruthy()
  })

  it('shows a friendly empty state and still offers to prepare applications', async () => {
    api.listApplications.mockResolvedValue({ items: [], total: 0 })
    renderBoard()
    expect(await screen.findByText(/No applications yet/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Prepare applications for me' })).toBeTruthy()
  })

  it('walks a first-time owner into their first job with the kit die-cut empty state', async () => {
    api.listApplications.mockResolvedValue({ items: [], total: 0 })
    renderBoard()
    // consistency-F01: the same first-run pattern as History, CV Studio and the dashboard (was a page-styled lemon sticker).
    const heading = await screen.findByRole('heading', { name: 'Add your first job' })
    expect(heading.closest('.kit-empty')).not.toBeNull()
    // "Add a job" stays in the header, where it already sat (disabled) while the board loaded: the header row keeps its
    // height when an empty board arrives, and the card no longer repeats it.
    const add = screen.getByRole('button', { name: 'Add a job by hand' })
    expect(add.closest('.kit-page-header')).not.toBeNull()
    expect(add.hasAttribute('disabled')).toBe(false)
    // One way to Discover for the view: the card's. The header's "Discover jobs" repeated it and is left out here.
    // (Both now carry the one label the app uses for Discover, so the card's link is the only one.)
    const discover = screen.getAllByRole('link', { name: 'Discover jobs' })
    expect(discover).toHaveLength(1)
    expect(discover[0].getAttribute('href')).toBe('/discovery')
    expect(discover[0].closest('.kit-page-header')).toBeNull()
    // consistency-F03: the empty state's one next step is a primary md button, no icon (as on the dashboard).
    expect(discover[0].className).toContain('kit-button--primary')
    expect(discover[0].className).toContain('kit-button--md')
    expect(discover[0].querySelector('svg')).toBeNull()
  })

  it('orders each column like the list: pinned first, then the soonest date, nothing due last', async () => {
    const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()
    const saved = [
      { ...base, id: 's-1', title: 'Data Engineer', company: 'Fjord', status: 'saved' },
      { ...base, id: 's-2', title: 'Backend Engineer', company: 'Acme', status: 'saved', deadline: day(2) },
      { ...base, id: 's-3', title: 'Staff Engineer', company: 'Pinecrest', status: 'saved', deadline: day(-1) },
      { ...base, id: 's-4', title: 'API Engineer', company: 'Quill', status: 'saved', is_pinned: true },
    ]
    api.listApplications.mockResolvedValue({ items: saved, total: saved.length })
    renderBoard()
    await screen.findByText('Data Engineer')
    const titles = within(column('Saved')).getAllByRole('link').map((link) => link.textContent)
    expect(titles).toEqual(['API Engineer', 'Staff Engineer', 'Backend Engineer', 'Data Engineer'])
  })

  it('says where a moved card went', async () => {
    api.updateApplication.mockResolvedValue({ ...items[0], status: 'interviewing', applied_at: '2026-09-24T10:00:00Z' })
    renderBoard()
    await moveTo('Backend Engineer', 'Interviewing')
    expect(await screen.findByText('Moved “Backend Engineer” to Interviewing.', { selector: '.kit-toast__title' })).toBeTruthy()
  })

  // F32: the moved card re-renders in its new column and its old Move button is gone; focus followed it to <body>.
  it('puts focus back on the moved card\'s Move button in its new column', async () => {
    api.updateApplication.mockResolvedValue({ ...items[0], status: 'interviewing', applied_at: '2026-09-24T10:00:00Z' })
    renderBoard()
    await screen.findByText('Backend Engineer')
    // The refetch after the move sees the card where it went.
    api.listApplications.mockResolvedValue({ items: [{ ...items[0], status: 'interviewing' }, ...items.slice(1)], total: items.length })
    await moveTo('Backend Engineer', 'Interviewing')
    await screen.findByText('Moved “Backend Engineer” to Interviewing.', { selector: '.kit-toast__title' })
    await waitFor(() => expect(document.activeElement).toBe(within(column('Interviewing')).getByRole('button', { name: 'Move Backend Engineer' })))
  })

  // F32 on a phone: the card leaves the stage on screen, so focus lands on the stage switcher instead of <body>.
  it('on a phone, focuses the stage switcher when the moved card leaves the stage on screen', async () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query.includes('max-width: 767px'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia
    try {
      api.updateApplication.mockResolvedValue({ ...items[0], status: 'interviewing', applied_at: '2026-09-24T10:00:00Z' })
      renderBoard()
      await screen.findByText('Backend Engineer')
      api.listApplications.mockResolvedValue({ items: [{ ...items[0], status: 'interviewing' }, ...items.slice(1)], total: items.length })
      await moveTo('Backend Engineer', 'Interviewing')
      expect(await screen.findByRole('button', { name: 'Show Interviewing' })).toBeTruthy()
      const stages = screen.getByRole('radiogroup', { name: 'Stage' })
      await waitFor(() => expect(document.activeElement).toBe(within(stages).getByRole('radio', { name: /^Saved/ })))
    } finally {
      window.matchMedia = original
    }
  })

  // F39: a tablet shows about two and a half columns; a card moved to one scrolled out of view got no way to follow it.
  // F44: when focus follows the card to its new column (it fell to <body> with the old Move button), the browser
  // scrolls the board there itself, so a "Show Offer" on the toast would do nothing visible: it is offered only when
  // the person has gone elsewhere and the board stays where it was.
  function offerColumnOffscreen() {
    const rect = Element.prototype.getBoundingClientRect
    const box = (left: number, right: number) => ({ left, right, top: 0, bottom: 100, width: right - left, height: 100, x: left, y: 0, toJSON: () => ({}) })
    const scrolled = vi.fn()
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.classList.contains('camp-board')) return box(0, 700)
      const stage = this.getAttribute('data-stage')
      if (stage) return stage === 'offer' || stage === 'closed' ? box(780, 980) : box(0, 200)
      return rect.call(this)
    }
    const scrollIntoView = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element, arg?: boolean | ScrollIntoViewOptions) {
      if (this.getAttribute('data-stage') === 'offer') scrolled(arg)
    }
    return {
      scrolled,
      restore: () => {
        Element.prototype.getBoundingClientRect = rect
        Element.prototype.scrollIntoView = scrollIntoView
      },
    }
  }

  it('follows a card moved to an off-screen column with focus, and then offers no redundant Show', async () => {
    api.updateApplication.mockResolvedValue({ ...items[0], status: 'offer', applied_at: '2026-09-24T10:00:00Z' })
    const board = offerColumnOffscreen()
    try {
      renderBoard()
      await screen.findByText('Backend Engineer')
      // The refetch after the move sees the card where it went.
      api.listApplications.mockResolvedValue({ items: [{ ...items[0], status: 'offer' }, ...items.slice(1)], total: items.length })
      await moveTo('Backend Engineer', 'Offer')
      await screen.findByText('Moved “Backend Engineer” to Offer.', { selector: '.kit-toast__title' })
      await waitFor(() => expect(document.activeElement).toBe(within(column('Offer')).getByRole('button', { name: 'Move Backend Engineer' })))
      expect(screen.queryByRole('button', { name: /^Show / })).toBeNull()
    } finally {
      board.restore()
    }
  })

  it('offers to show the target column when focus has gone elsewhere and the board stays scrolled away', async () => {
    let land: (value: unknown) => void = () => undefined
    api.updateApplication.mockReturnValue(new Promise((resolve) => { land = resolve }))
    const board = offerColumnOffscreen()
    try {
      renderBoard()
      await moveTo('Backend Engineer', 'Offer')
      // While the move is saving, the person tabs on to another card.
      const elsewhere = screen.getByRole('button', { name: 'Move Python Developer' })
      elsewhere.focus()
      land({ ...items[0], status: 'offer', applied_at: '2026-09-24T10:00:00Z' })
      fireEvent.click(await screen.findByRole('button', { name: 'Show Offer' }))
      expect(board.scrolled).toHaveBeenCalledWith(expect.objectContaining({ inline: 'nearest' }))
      // The toast and its button go away: focus follows the card instead of falling to <body>.
      await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('Move Backend Engineer'))
    } finally {
      board.restore()
    }
  })

  it('offers no Show action when the target column is already in view', async () => {
    api.updateApplication.mockResolvedValue({ ...items[0], status: 'interviewing', applied_at: '2026-09-24T10:00:00Z' })
    renderBoard()
    await moveTo('Backend Engineer', 'Interviewing')
    await screen.findByText('Moved “Backend Engineer” to Interviewing.', { selector: '.kit-toast__title' })
    expect(screen.queryByRole('button', { name: /^Show / })).toBeNull()
  })

  it('colours each Move to item with its stage dot', async () => {
    renderBoard()
    fireEvent.keyDown(await screen.findByRole('button', { name: 'Move Backend Engineer' }), { key: 'Enter' })
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Applied' }).querySelector('.kit-tone-dot')?.getAttribute('data-tone')).toBe('lilac')
    expect(within(menu).getByRole('menuitem', { name: 'Offer' }).querySelector('.kit-tone-dot')?.getAttribute('data-tone')).toBe('mint')
  })

  it('asks before moving an applied application back to Saved, which deletes what was sent', async () => {
    api.updateApplication.mockResolvedValue({ ...items[3], status: 'saved', applied_at: null })
    renderBoard()
    await moveTo('SRE', 'Saved')
    const dialog = await screen.findByRole('alertdialog', { name: 'Move it back to Saved?' })
    expect(api.updateApplication).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move to Saved' }))
    await waitFor(() => expect(api.updateApplication).toHaveBeenCalledWith('a-4', { status: 'saved' }))
  })

  it('moves a never-applied card back to Saved without asking', async () => {
    api.updateApplication.mockResolvedValue({ ...items[4], status: 'saved' })
    renderBoard()
    await moveTo('ML Engineer', 'Saved')
    await waitFor(() => expect(api.updateApplication).toHaveBeenCalledWith('a-5', { status: 'saved' }))
    expect(screen.queryByText('Move it back to Saved?')).toBeNull()
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

  it('says a date once: an urgent chip replaces the date in the next-step line, on the board and in the list', async () => {
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString()
    const dated = [
      { ...items[0], id: 'u-1', title: 'Soon Task Role', next_task: { title: 'Tailor CV', deadline: day(2) } },
      { ...items[0], id: 'u-2', title: 'Far Task Role', next_task: { title: 'Read the blog', deadline: day(30) } },
      { ...base, id: 'u-3', title: 'Soon Apply Role', company: 'Es', status: 'saved', deadline: day(3) },
    ]
    api.listApplications.mockResolvedValue({ items: dated, total: dated.length })
    renderBoard()
    const soon = (await screen.findByText('Soon Task Role')).closest('article') as HTMLElement
    expect(within(soon).getByText('Next: Tailor CV')).toBeTruthy()
    expect(within(soon).queryByText(/^due /)).toBeNull()
    expect(within(soon).getByText('Task due in 2 days')).toBeTruthy()
    // Nothing urgent: the date stays in the line.
    const far = screen.getByText('Far Task Role').closest('article') as HTMLElement
    expect(within(far).getByText(/^due /)).toBeTruthy()
    const apply = screen.getByText('Soon Apply Role').closest('article') as HTMLElement
    expect(within(apply).queryByText(/^Apply by/)).toBeNull()
    expect(within(apply).getByText('Due in 3 days')).toBeTruthy()

    fireEvent.click(screen.getByRole('radio', { name: 'List' }))
    const row = within(screen.getByRole('table')).getByText('Soon Task Role').closest('tr') as HTMLElement
    expect(within(row).getByText('Tailor CV')).toBeTruthy()
    expect(within(row).getByText('Task due in 2 days')).toBeTruthy()
  })

  it('says a date once on an Offer whose reply task falls on the reply-by date', async () => {
    // "Add a task to reply to the offer" gives the task the offer's reply date: the chip ("Reply due in 3
    // days") already states that day, so the next-step line drops its own "due <date>".
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString()
    const offer = {
      ...base, id: 'o-1', title: 'Offer Role', company: 'Lumen', status: 'offer', applied_at: day(-20),
      deadline: day(3), next_task: { title: 'Reply to the offer', deadline: day(3) },
    }
    api.listApplications.mockResolvedValue({ items: [offer], total: 1 })
    renderBoard()
    const card = (await screen.findByText('Offer Role')).closest('article') as HTMLElement
    expect(within(card).getByText('Next: Reply to the offer')).toBeTruthy()
    expect(within(card).getByText('Reply due in 3 days')).toBeTruthy()
    expect(within(card).queryByText(/^due /)).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: 'List' }))
    const row = within(screen.getByRole('table')).getByText('Offer Role').closest('tr') as HTMLElement
    expect(within(row).getByText('Reply to the offer')).toBeTruthy()
    expect(within(row).getByText('Reply due in 3 days')).toBeTruthy()
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

  it('focuses the Role field with a mouse, and the dialog itself on a phone so the keyboard stays down (consistency-F09)', async () => {
    renderBoard()
    await screen.findByText('Backend Engineer')
    fireEvent.click(screen.getByRole('button', { name: 'Add a job by hand' }))
    await screen.findByRole('dialog', { name: 'Add a job by hand' })
    await waitFor(() => expect(document.activeElement?.id).toBe('add-application-role'))
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add a job by hand' })).toBeNull())

    vi.stubGlobal('matchMedia', (query: string) => ({ matches: /pointer:\s*coarse/.test(query), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Add a job by hand' }))
      const dialog = await screen.findByRole('dialog', { name: 'Add a job by hand' })
      await waitFor(() => expect(document.activeElement).toBe(dialog))
    } finally {
      vi.unstubAllGlobals()
    }
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

  it('says once that a keyword is missing: the refusal replaces the standing hint', async () => {
    api.getApplicationPreferences.mockResolvedValue({ ...prefs, keywords: [] })
    api.prepareApplicationsForMe.mockResolvedValue({ prepared: [], matched_count: 0, skipped_existing_count: 0, max_per_run: 5, reason: 'no_preferences' })
    renderBoard()
    await screen.findByText('Add at least one keyword so we know which jobs to prepare.')
    fireEvent.click(screen.getByRole('button', { name: /Prepare applications$/ }))
    await screen.findByText(/Add at least one keyword above/)
    expect(screen.getAllByText(/Add at least one keyword/)).toHaveLength(1)
  })

  it('picks how many to prepare per click from a list, beside a framed remote checkbox', async () => {
    api.saveApplicationPreferences.mockResolvedValue({ ...prefs, max_per_run: 3 })
    renderBoard()
    const cap = (await screen.findByRole('combobox', { name: 'Most per click' })) as HTMLSelectElement
    expect(cap.value).toBe('5')
    expect([...cap.options].map((option) => option.value)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])
    fireEvent.change(cap, { target: { value: '3' } })
    await waitFor(() => expect(api.saveApplicationPreferences).toHaveBeenCalledWith({
      keywords: ['backend'], locations: [], remote: true, max_per_run: 3,
    }))
    expect(screen.getByRole('checkbox', { name: 'Include remote jobs' }).closest('[data-framed]')).not.toBeNull()
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
    const region = screen.getByRole('region', { name: 'Remote or on-site' })
    // consistency-F29: the groups take row-title type (Section xs), a step under the panel's "What's working" title.
    expect(region.getAttribute('data-size')).toBe('xs')
    const group = within(region)
    expect(group.getByText('Remote')).toBeTruthy()
    expect(group.getByText('60%')).toBeTruthy()
    expect(group.getByLabelText('60%, 3 of 5 applications')).toBeTruthy()
    expect(group.getByText('of 5')).toBeTruthy()
    expect(group.getByText('Not enough data yet: On-site (2)')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Company' })).toBeNull()
  })
})
