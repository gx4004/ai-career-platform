import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardToday, DashboardTodaySkeleton } from '#/components/dashboard/DashboardToday'
import { ToastProvider } from '#/components/kit'

const getToday = vi.hoisted(() => vi.fn())
const adopt = vi.hoisted(() => vi.fn())
const deleteApplication = vi.hoisted(() => vi.fn())
const navigate = vi.hoisted(() => vi.fn())
const getApplication = vi.hoisted(() => vi.fn())
const writeWorkflowContext = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/client', () => ({
  getToday,
  adoptDiscoveryRecommendation: adopt,
  deleteApplication,
  getApplication,
}))
vi.mock('#/lib/tools/drafts', () => ({ writeWorkflowContext }))
vi.mock('#/hooks/useSession', () => ({ useSession: () => ({ status: 'authenticated' }) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, search, ...props }: { children: ReactNode; to: string; params?: Record<string, string>; search?: Record<string, string> } & Record<string, unknown>) => (
    <a href={`${params ? to.replace('$campaignId', params.campaignId) : to}${search ? `?${new URLSearchParams(search)}` : ''}`} {...props}>{children}</a>
  ),
  useNavigate: () => navigate,
}))

const LISTING = {
  listing_id: 'listing-1',
  title: 'Platform Engineer',
  company: 'Acme Systems',
  preview: 'Build things.',
  location: 'Berlin',
  remote: true,
  posted_at: null,
  apply_url: null,
  department: null,
  skills_fit: 82,
  matched_skills: ['Kubernetes', 'Python', 'Go', 'AWS'],
  missing_skills: ['Terraform'],
  preference_hits: [],
  source_name: 'Greenhouse',
  source_url: 'https://boards.greenhouse.io/acme/jobs/1',
}

function plan(overrides: Record<string, unknown> = {}) {
  return {
    has_sources: true,
    has_evidence: true,
    best_matches: [LISTING],
    closest_matches: [],
    needs_action: [],
    needs_action_total: 0,
    ...overrides,
  }
}

/** The ToastProvider keeps an (empty) alert announcer on the page: find the alert that says it. */
async function expectAlert(text: string) {
  await waitFor(() => expect(screen.getAllByRole('alert').some((el) => el.textContent?.includes(text))).toBe(true))
}

function renderToday(
  props: { firstSteps?: boolean; hasResume?: boolean; noApplications?: boolean } = {},
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <DashboardToday {...props} />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('DashboardToday', () => {
  beforeEach(() => {
    getToday.mockReset()
    adopt.mockReset()
    deleteApplication.mockReset()
    navigate.mockReset()
    getApplication.mockReset()
    writeWorkflowContext.mockReset()
  })

  it('shows a match with its skills fit sample and adds it to applications', async () => {
    getToday.mockResolvedValueOnce(plan()).mockResolvedValue(plan({ best_matches: [] }))
    adopt.mockResolvedValue({ application: { id: 'app-1', title: 'Platform Engineer' }, created: true })
    renderToday()

    expect(await screen.findByText('Platform Engineer')).toBeTruthy()
    expect(screen.getByRole('img', { name: '82% fit' })).toBeTruthy()
    expect(screen.getByText('4 of 5 skills')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Platform Engineer/ }).getAttribute('href')).toBe(
      LISTING.source_url,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add Platform Engineer to applications' }))

    await waitFor(() => expect(adopt.mock.calls[0][0]).toBe('listing-1'))
    // It stays on the dashboard: the row leaves the list and a toast offers the new application.
    expect(await screen.findByText('Added to your applications', { selector: '.kit-toast__title' })).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Add Platform Engineer to applications' })).toBeNull())
    expect(navigate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'View application' }))
    expect(navigate).toHaveBeenCalledWith({
      to: '/campaigns/$campaignId',
      params: { campaignId: 'app-1' },
    })
  })

  it('lists applications that need action with the reason and the wait', async () => {
    getToday.mockResolvedValue(
      plan({
        needs_action: [
          {
            application_id: 'a1', title: 'Backend Engineer', company: 'Globex', status: 'interviewing',
            reason: 'interview', deadline: null, applied_at: null, days_since_applied: null,
          },
          {
            application_id: 'a2', title: 'Data Engineer', company: 'Initech', status: 'applied',
            reason: 'no_reply', deadline: null, applied_at: '2026-09-01T00:00:00Z', days_since_applied: 22,
          },
        ],
        needs_action_total: 3,
      }),
    )
    renderToday()

    expect(await screen.findByText('Backend Engineer')).toBeTruthy()
    expect(screen.getByText(/Interviewing/)).toBeTruthy()
    expect(screen.getByText(/No reply yet\? Applied 22 days ago/)).toBeTruthy()
    expect(screen.getByText('and 1 more in Applications')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Data Engineer/ }).getAttribute('href')).toBe('/campaigns/a2')
  })

  it('draws the first two as stickers by meaning, the rest as rows, with the total in a count', async () => {
    const item = (id: string, reason: string, extra: Record<string, unknown> = {}) => ({
      application_id: id, title: `Role ${id}`, company: 'Globex', status: 'applied', reason,
      deadline: null, applied_at: null, days_since_applied: null, ...extra,
    })
    getToday.mockResolvedValue(
      plan({
        needs_action: [
          item('a1', 'interview', { status: 'interviewing' }),
          item('a2', 'deadline', { deadline: '2026-10-09T00:00:00Z', status: 'saved' }),
          item('a3', 'no_reply', { days_since_applied: 30 }),
        ],
        needs_action_total: 5,
      }),
    )
    renderToday()

    await screen.findByText('Role a1')
    const stickers = screen.getByRole('list', { name: 'Needs action' }).querySelectorAll('.kit-sticker')
    expect(Array.from(stickers).map((el) => el.getAttribute('data-tone'))).toEqual(['tangerine', 'rose'])
    expect(screen.getByRole('link', { name: 'Prep for the round' }).getAttribute('href')).toBe('/interview')
    expect(screen.getByRole('link', { name: 'Role a1' }).getAttribute('href')).toBe('/campaigns/a1')
    const more = screen.getByRole('list', { name: 'More that need action' })
    expect(within(more).getByRole('link', { name: 'Role a3' })).toBeTruthy()
    expect(within(more).getByText('and 2 more in Applications')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: /^Needs action\s*5$/ })).toBeTruthy()
  })

  it('carries the application into Interview Q&A from "Prep for the round"', async () => {
    getToday.mockResolvedValue(
      plan({
        needs_action: [
          { application_id: 'a1', title: 'Backend Engineer', company: 'Globex', status: 'interviewing', reason: 'interview', deadline: null, applied_at: null, days_since_applied: null },
        ],
        needs_action_total: 1,
      }),
    )
    getApplication.mockResolvedValue({
      id: 'a1',
      label: 'Backend Engineer at Globex',
      listing: { title: 'Backend Engineer', company: 'Globex', description: 'Run our APIs.' },
    })
    renderToday()

    fireEvent.click(await screen.findByRole('link', { name: 'Prep for the round' }))

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/interview' }))
    expect(getApplication).toHaveBeenCalledWith('a1')
    expect(writeWorkflowContext.mock.calls[0][0]).toMatchObject({
      targetRole: 'Backend Engineer',
      jobDescription: 'Backend Engineer at Globex\n\nRun our APIs.',
      workspaceId: 'a1',
      workspaceLabel: 'Backend Engineer at Globex',
    })
  })

  it('"Prep for the round" does not carry an earlier job description into Interview Q&A', async () => {
    const drafts = await vi.importActual<typeof import('#/lib/tools/drafts')>('#/lib/tools/drafts')
    writeWorkflowContext.mockImplementation(drafts.writeWorkflowContext)
    window.sessionStorage.clear()
    // An earlier hand-off in this tab: another job's description, its label and source, and its run.
    drafts.writeWorkflowContext({
      resumeText: 'My resume text',
      jobDescription: 'Data Scientist at Initech\n\nTrain models.',
      jobLabel: 'Data Scientist at Initech',
      jobSource: 'your application “Data Scientist at Initech”',
      historyId: 'run-old',
      jobMatch: { summary: { headline: 'Old job' }, interview_focus: ['Old job focus'] } as never,
      updatedAt: Date.now(),
    })
    getToday.mockResolvedValue(
      plan({
        needs_action: [
          { application_id: 'a1', title: 'Backend Engineer', company: 'Globex', status: 'interviewing', reason: 'interview', deadline: null, applied_at: null, days_since_applied: null },
        ],
        needs_action_total: 1,
      }),
    )
    // This application has no saved listing description.
    getApplication.mockResolvedValue({ application: { id: 'a1', label: 'Backend Engineer at Globex', listing: null }, created: true })
    renderToday()

    fireEvent.click(await screen.findByRole('link', { name: 'Prep for the round' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/interview' }))

    const context = drafts.readWorkflowContext()
    expect(context).toMatchObject({ targetRole: 'Backend Engineer', workspaceId: 'a1', resumeText: 'My resume text' })
    expect(context?.jobDescription).toBeUndefined()
    expect(context?.jobLabel).toBeUndefined()
    expect(context?.jobSource).toBeUndefined()
    expect(context?.historyId).toBeUndefined()
    expect(context?.jobMatch).toBeUndefined()
    window.sessionStorage.clear()
  })

  it('stamps a deadline with its date and how far away it is', async () => {
    const soon = new Date()
    soon.setDate(soon.getDate() + 5)
    getToday.mockResolvedValue(
      plan({
        needs_action: [
          { application_id: 'a1', title: 'Platform Engineer', company: 'Harbor Health', status: 'saved', reason: 'deadline', deadline: soon.toISOString(), applied_at: null, days_since_applied: null },
        ],
        needs_action_total: 1,
      }),
    )
    renderToday()

    expect(await screen.findByText('in 5 days')).toBeTruthy()
  })

  it('asks for a job board when there are no sources', async () => {
    getToday.mockResolvedValue(plan({ has_sources: false, best_matches: [] }))
    renderToday()

    expect(await screen.findByText('No job boards yet')).toBeTruthy()
    expect(screen.getByText('Nothing needs you today')).toBeTruthy()
  })

  it('asks for skills in the profile when there are none, and opens the Add a fact dialog there', async () => {
    getToday.mockResolvedValue(plan({ has_evidence: false, best_matches: [] }))
    renderToday()

    expect(await screen.findByText('Add your skills to see matches')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Add skills' })
    expect(link.getAttribute('href')).toBe('/profile?add=fact')
  })

  it('before the resume is in, says matches come after it and offers no second "first" move', async () => {
    getToday.mockResolvedValue(plan({ has_evidence: false, best_matches: [] }))
    renderToday({ firstSteps: true, hasResume: false })

    expect(await screen.findByText('Matches appear after your resume')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Add skills' })).toBeNull()
    // Step 3 of the first steps already offers Discover jobs.
    expect(screen.queryByRole('link', { name: 'Discover jobs' })).toBeNull()
    // Nothing needs action and there are no applications: no "View all" into an empty page.
    expect(screen.queryByRole('link', { name: 'View all' })).toBeNull()
  })

  it('hands focus to the next Add when an added row leaves the list, not back to the top of the page', async () => {
    const second = { ...LISTING, listing_id: 'listing-2', title: 'Data Engineer' }
    getToday.mockResolvedValueOnce(plan({ best_matches: [LISTING, second] })).mockResolvedValue(plan({ best_matches: [second] }))
    adopt.mockResolvedValue({ application: { id: 'app-1', title: 'Platform Engineer' }, created: true })
    renderToday()

    const add = await screen.findByRole('button', { name: 'Add Platform Engineer to applications' })
    add.focus()
    fireEvent.click(add)

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Add Platform Engineer to applications' })).toBeNull())
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add Data Engineer to applications' }))
  })

  // Sign-off chrome-F34: adding the last best match empties the list until the refetched plan brings the
  // closest matches; focus used to land on the empty state's action, which then left, dropping focus to the page.
  it('hands focus to the first closest match when adding the last best one brings them', async () => {
    const closest = [
      { ...LISTING, listing_id: 'listing-2', title: 'Data Engineer', skills_fit: 40 },
      { ...LISTING, listing_id: 'listing-3', title: 'Site Reliability Engineer', skills_fit: 35 },
    ]
    let refetched: (value: unknown) => void = () => {}
    getToday
      .mockResolvedValueOnce(plan({ best_matches: [LISTING], closest_matches: [] }))
      .mockReturnValueOnce(new Promise((resolve) => { refetched = resolve }))
    adopt.mockResolvedValue({ application: { id: 'app-1', title: 'Platform Engineer' }, created: true })
    renderToday()

    const add = await screen.findByRole('button', { name: 'Add Platform Engineer to applications' })
    add.focus()
    fireEvent.click(add)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Add Platform Engineer to applications' })).toBeNull())
    // While the plan is refetched focus waits on the section, which stays, not on a control that may leave.
    const section = screen.getByRole('heading', { level: 2, name: /matches to add/ }).closest('section')
    expect(document.activeElement).toBe(section)

    refetched(plan({ best_matches: [], closest_matches: closest }))
    const first = await screen.findByRole('button', { name: 'Add Data Engineer to applications' })
    await waitFor(() => expect(document.activeElement).toBe(first))
  })

  // Sign-off chrome-F34 (live): the refetch can start a render after the list empties. Focus used to go to the
  // empty state's action at once ("settled"), which left when the closest matches arrived, dropping focus to the page.
  it('still hands focus to the first closest match when the refetch starts a render after the list empties', async () => {
    const closest = [{ ...LISTING, listing_id: 'listing-2', title: 'Data Engineer', skills_fit: 40 }]
    getToday
      .mockResolvedValueOnce(plan({ best_matches: [LISTING], closest_matches: [] }))
      .mockResolvedValue(plan({ best_matches: [], closest_matches: closest }))
    adopt.mockResolvedValue({ application: { id: 'app-1', title: 'Platform Engineer' }, created: true })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = client.invalidateQueries.bind(client)
    client.invalidateQueries = ((...args: Parameters<typeof invalidate>) =>
      new Promise<void>((resolve) => setTimeout(resolve, 30)).then(() => invalidate(...args))) as typeof invalidate
    renderToday({}, client)

    const add = await screen.findByRole('button', { name: 'Add Platform Engineer to applications' })
    add.focus()
    fireEvent.click(add)
    const first = await screen.findByRole('button', { name: 'Add Data Engineer to applications' })
    await waitFor(() => expect(document.activeElement).toBe(first))
  })

  it('leaves focus on the empty list\'s action once the refetched plan has no rows either', async () => {
    getToday
      .mockResolvedValueOnce(plan({ best_matches: [LISTING], closest_matches: [] }))
      .mockResolvedValue(plan({ best_matches: [], closest_matches: [] }))
    adopt.mockResolvedValue({ application: { id: 'app-1', title: 'Platform Engineer' }, created: true })
    renderToday()

    const add = await screen.findByRole('button', { name: 'Add Platform Engineer to applications' })
    add.focus()
    fireEvent.click(add)
    await waitFor(() => expect(getToday).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Browse all jobs' })))
  })

  // Sign-off chrome-F08 (STICKER 4.D): the Add toast offers View application and Undo.
  it('undoes an add: deletes the new application, puts the row back in its place and focuses its Add', async () => {
    const second = { ...LISTING, listing_id: 'listing-2', title: 'Data Engineer' }
    getToday.mockResolvedValueOnce(plan({ best_matches: [LISTING, second] })).mockReturnValue(new Promise(() => {}))
    adopt.mockResolvedValue({ application: { id: 'app-1', title: 'Platform Engineer', created_at: new Date().toISOString() }, created: true })
    deleteApplication.mockResolvedValue({ deleted: 1 })
    renderToday()

    fireEvent.click(await screen.findByRole('button', { name: 'Add Platform Engineer to applications' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))

    await waitFor(() => expect(deleteApplication).toHaveBeenCalledWith('app-1'))
    const restored = await screen.findByRole('button', { name: 'Add Platform Engineer to applications' })
    const rows = screen.getAllByRole('button', { name: /^Add .* to applications$/ })
    expect(rows[0]).toBe(restored)
    await waitFor(() => expect(document.activeElement).toBe(restored))
    expect(await screen.findByText('Removed from your applications', { selector: '.kit-toast__title' })).toBeTruthy()
  })

  // Sign-off chrome-F41: the skeleton draws the sections in the order the plan will most likely use.
  it('loads in the order the page will land: Best matches first for an account without applications', () => {
    const headings = () => screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    const { unmount } = render(<DashboardTodaySkeleton />)
    expect(headings()).toEqual(['Needs action', 'Best matches to add'])
    unmount()

    getToday.mockReturnValue(new Promise(() => {}))
    renderToday({ noApplications: true })
    expect(headings()).toEqual(['Best matches to add', 'Needs action'])
  })

  // Sign-off chrome-F44: when Undo fails the toast says where the job is and links straight to it.
  it('links to the application when Undo cannot delete it', async () => {
    getToday.mockResolvedValueOnce(plan()).mockReturnValue(new Promise(() => {}))
    adopt.mockResolvedValue({ application: { id: 'app-1', title: 'Platform Engineer', created_at: new Date().toISOString() }, created: true })
    deleteApplication.mockRejectedValue(new Error('500'))
    renderToday()

    fireEvent.click(await screen.findByRole('button', { name: 'Add Platform Engineer to applications' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))

    expect(await screen.findByText('That job could not be removed', { selector: '.kit-toast__title' })).toBeTruthy()
    expect(screen.getByText('It is still in your applications.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open application' }))
    expect(navigate).toHaveBeenCalledWith({ to: '/campaigns/$campaignId', params: { campaignId: 'app-1' } })
  })

  // Review F3: the adopt call is idempotent; an application that already existed comes back with 200 (created: false),
  // and Undo would delete it with its tasks and notes. A recent created_at (added minutes ago elsewhere) is no licence.
  it('offers no Undo when the add returned an application that already existed', async () => {
    getToday.mockResolvedValueOnce(plan()).mockReturnValue(new Promise(() => {}))
    adopt.mockResolvedValue({ application: { id: 'app-old', title: 'Platform Engineer', created_at: new Date().toISOString() }, created: false })
    renderToday()

    fireEvent.click(await screen.findByRole('button', { name: 'Add Platform Engineer to applications' }))
    expect(await screen.findByRole('button', { name: 'View application' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })

  it('shows the server\'s best matches, and its closest ones under an honest title when none clears the floor', async () => {
    const weak = { ...LISTING, listing_id: 'listing-2', title: 'Data Engineer', skills_fit: 50 }
    getToday.mockResolvedValue(plan({ best_matches: [LISTING], closest_matches: [] }))
    const { unmount } = renderToday()

    expect(await screen.findByText('Platform Engineer')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: /^Best matches to add/ })).toBeTruthy()
    unmount()

    getToday.mockResolvedValue(plan({ best_matches: [], closest_matches: [weak] }))
    renderToday()
    expect(await screen.findByText('Data Engineer')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: /^Closest matches to add/ })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /^Best matches to add/ })).toBeNull()
    expect(screen.queryByText('You have seen every match')).toBeNull()
  })

  it('says what a low-confidence fit rests on instead of "2 of 2 skills" next to 50%', async () => {
    getToday.mockResolvedValue(
      plan({ best_matches: [{ ...LISTING, skills_fit: 50, fit_confidence: 'low', matched_skills: ['Go', 'Python'], missing_skills: [] }] }),
    )
    renderToday()
    expect(await screen.findByText('2 skills listed')).toBeTruthy()
    expect(screen.queryByText('2 of 2 skills')).toBeNull()
  })

  it('sends one add for a double click', async () => {
    getToday.mockResolvedValue(plan())
    let resolve: (value: { application: { id: string }; created: boolean }) => void = () => {}
    adopt.mockReturnValue(new Promise((r) => { resolve = r }))
    renderToday()
    const add = await screen.findByRole('button', { name: 'Add Platform Engineer to applications' })
    fireEvent.click(add)
    fireEvent.click(add)
    resolve({ application: { id: 'app-1' }, created: true })
    expect(await screen.findByText('Added to your applications', { selector: '.kit-toast__title' })).toBeTruthy()
    expect(adopt).toHaveBeenCalledTimes(1)
    expect(document.querySelectorAll('.kit-toast__title')).toHaveLength(1)
  })

  it('keeps Add visible at rest: it is not one of the hover-revealed actions', async () => {
    getToday.mockResolvedValue(plan())
    renderToday()

    const add = await screen.findByRole('button', { name: 'Add Platform Engineer to applications' })
    expect(add.closest('.kit-row__reveal')).toBeNull()
    expect(add.closest('[data-reveal]')).toBeNull()
  })

  it('leads with what needs action when something does, and with matches when nothing does', async () => {
    getToday.mockResolvedValue(
      plan({
        needs_action: [
          { application_id: 'a1', title: 'Backend Engineer', company: 'Globex', status: 'interviewing', reason: 'interview', deadline: null, applied_at: null, days_since_applied: null },
        ],
        needs_action_total: 1,
      }),
    )
    const { unmount } = renderToday()
    await screen.findByText('Backend Engineer')
    const names = () => screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent?.replace(/\s*\d+$/, ''))
    expect(names()).toEqual(['Needs action', 'Best matches to add'])
    unmount()

    getToday.mockResolvedValue(plan())
    renderToday()
    await screen.findByText('Platform Engineer')
    expect(names()).toEqual(['Best matches to add', 'Needs action'])
  })

  it('shows the deadline date of an application due soon', async () => {
    getToday.mockResolvedValue(
      plan({
        needs_action: [
          { application_id: 'a1', title: 'Backend Engineer', company: 'Globex', status: 'saved', reason: 'deadline', deadline: '2026-10-09T00:00:00Z', applied_at: null, days_since_applied: null },
        ],
        needs_action_total: 1,
      }),
    )
    renderToday()

    expect(await screen.findByText('Backend Engineer')).toBeTruthy()
    expect(screen.getByText(/^Oct 9$|^9 Oct$/)).toBeTruthy()
  })

  it('says the job could not be added and stays on the page when adding fails', async () => {
    getToday.mockResolvedValue(plan())
    adopt.mockRejectedValue(new Error('nope'))
    renderToday()

    fireEvent.click(await screen.findByRole('button', { name: 'Add Platform Engineer to applications' }))

    await expectAlert('That job could not be added')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('shows busy lists while loading and an error with a retry when it fails', async () => {
    let reject: (error: Error) => void = () => {}
    getToday.mockReturnValue(new Promise((_, rej) => { reject = rej }))
    renderToday()

    // Each section loads in its own shape: Needs action as sticker plates (a status), the matches as a busy list
    // of rows led by the fit stamp (was two busy lists of plain rows, which jumped when the stickers arrived).
    const busy = screen.getAllByRole('list', { hidden: true }).filter((list) => list.getAttribute('aria-busy') === 'true')
    expect(busy.length).toBe(1)
    expect(busy[0].querySelector('.kit-skeleton__leading--stamp')).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Loading what needs you' })).toBeTruthy()

    reject(new Error('down'))
    await expectAlert("couldn't be loaded")
    getToday.mockResolvedValue(plan())
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Platform Engineer')).toBeTruthy()
  })

  // Sign-off r4 chrome-F01 (WCAG 2.4.11): the Add that takes focus sat under the toast stack. Focus moves without
  // the browser's own jump, then the Add is scrolled only as far as needed, which honours the root's scroll padding
  // (kit/toast.css keeps that padding clear of the toasts).
  it('scrolls the Add it focuses clear of the toasts, after an add and after an undo', async () => {
    const second = { ...LISTING, listing_id: 'listing-2', title: 'Data Engineer' }
    getToday.mockResolvedValueOnce(plan({ best_matches: [LISTING, second] })).mockReturnValue(new Promise(() => {}))
    adopt.mockResolvedValue({ application: { id: 'app-1', title: 'Platform Engineer', created_at: new Date().toISOString() }, created: true })
    deleteApplication.mockResolvedValue({ deleted: 1 })
    const scrolled: Array<{ element: Element; options: unknown }> = []
    const hadScroll = Object.prototype.hasOwnProperty.call(Element.prototype, 'scrollIntoView')
    const originalScroll = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element, options?: unknown) {
      scrolled.push({ element: this, options })
    } as typeof Element.prototype.scrollIntoView
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    const focusOptions = (element: Element) =>
      focus.mock.contexts.flatMap((context, index) => (context === element ? [focus.mock.calls[index][0]] : []))
    try {
      renderToday()
      const add = await screen.findByRole('button', { name: 'Add Platform Engineer to applications' })
      add.focus()
      fireEvent.click(add)
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Add Platform Engineer to applications' })).toBeNull())
      const next = screen.getByRole('button', { name: 'Add Data Engineer to applications' })
      expect(document.activeElement).toBe(next)
      expect(focusOptions(next)).toContainEqual({ preventScroll: true })
      expect(scrolled).toContainEqual({ element: next, options: { block: 'nearest' } })

      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
      const restored = await screen.findByRole('button', { name: 'Add Platform Engineer to applications' })
      await waitFor(() => expect(document.activeElement).toBe(restored))
      expect(focusOptions(restored)).toContainEqual({ preventScroll: true })
      expect(scrolled).toContainEqual({ element: restored, options: { block: 'nearest' } })
    } finally {
      focus.mockRestore()
      if (hadScroll) Element.prototype.scrollIntoView = originalScroll
      else delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    }
  })

  // Sign-off r4 chrome-F02: each Add opened its own toast and three stayed for 8s, covering the next rows' Add
  // buttons on a phone. A run of adds keeps one toast: the latest add replaces it, and its Undo is for that add.
  it('keeps one toast for a run of adds, and its Undo reverses the latest add', async () => {
    const second = { ...LISTING, listing_id: 'listing-2', title: 'Data Engineer' }
    const createdAt = new Date().toISOString()
    getToday.mockResolvedValueOnce(plan({ best_matches: [LISTING, second] })).mockReturnValue(new Promise(() => {}))
    adopt
      .mockResolvedValueOnce({ application: { id: 'app-1', title: 'Platform Engineer', created_at: createdAt }, created: true })
      .mockResolvedValueOnce({ application: { id: 'app-2', title: 'Data Engineer', created_at: createdAt }, created: true })
    deleteApplication.mockResolvedValue({ deleted: 1 })
    renderToday()

    fireEvent.click(await screen.findByRole('button', { name: 'Add Platform Engineer to applications' }))
    expect(await screen.findByText('Platform Engineer', { selector: '.kit-toast__description' })).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Add Data Engineer to applications' }))
    expect(await screen.findByText('Data Engineer', { selector: '.kit-toast__description' })).toBeTruthy()
    expect(document.querySelectorAll('.kit-toast')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(deleteApplication).toHaveBeenCalledWith('app-2'))
    expect(await screen.findByText('Removed from your applications', { selector: '.kit-toast__title' })).toBeTruthy()
    expect(document.querySelectorAll('.kit-toast')).toHaveLength(1)
  })
})
