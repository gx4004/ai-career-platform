import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '#/components/kit'
import { DiscoveryPage } from '#/pages/discovery-page'
import { ApiError } from '#/lib/api/errors'
import { readWorkflowContext } from '#/lib/tools/drafts'

const searchListings = vi.hoisted(() => vi.fn())
const dismissRecommendation = vi.hoisted(() => vi.fn())
const undismissRecommendation = vi.hoisted(() => vi.fn())
const adoptRecommendation = vi.hoisted(() => vi.fn())
const getListing = vi.hoisted(() => vi.fn())
const startDeepMatch = vi.hoisted(() => vi.fn())
const navigate = vi.hoisted(() => vi.fn())
const hiddenJobs = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/client', () => ({
  searchDiscoveryListings: searchListings,
  dismissDiscoveryRecommendation: dismissRecommendation,
  undismissDiscoveryRecommendation: undismissRecommendation,
  adoptDiscoveryRecommendation: adoptRecommendation,
  getDiscoveryListing: getListing,
  startDiscoveryDeepMatch: startDeepMatch,
}))

vi.mock('#/components/discovery/hiddenJobs', () => ({
  hiddenJobsQuery: () => ({ queryKey: ['discovery', 'recommendations', 'hidden'], queryFn: hiddenJobs, retry: false }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, ...rest }: { children: ReactNode; to: string; params?: Record<string, string> }) => (
    <a href={params ? to.replace(/\$(\w+)/, (_match, key: string) => params[key]) : to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
}))

const LISTING = {
  listing_id: 'listing-1',
  title: 'Platform Engineer',
  company: 'Acme Systems',
  preview: 'Build Kubernetes services. Work with Python every day.',
  location: 'Berlin, Germany',
  remote: true,
  posted_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  apply_url: 'https://jobs.example/apply/1',
  department: 'Infrastructure',
  skills_fit: 82,
  matched_skills: ['Kubernetes', 'Python'],
  missing_skills: ['Terraform'],
  preference_hits: ['Startup'],
  source_name: 'Greenhouse',
  source_url: 'https://boards.example/jobs/1',
}

function page(overrides: Record<string, unknown> = {}) {
  return {
    items: [LISTING],
    total: 1,
    page: 1,
    limit: 20,
    sort: 'best_match',
    has_evidence: true,
    companies: ['Acme Systems', 'Stripe'],
    ...overrides,
  }
}

function renderPage(payload: unknown = page()) {
  searchListings.mockResolvedValue(payload)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <DiscoveryPage />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

const findCard = async () =>
  (await screen.findByRole('heading', { name: 'Platform Engineer', level: 2 }, { timeout: 5_000 })).closest('li') as HTMLElement
const openMenu = async (card: HTMLElement) => {
  fireEvent.keyDown(within(card).getByRole('button', { name: 'More actions for Platform Engineer' }), { key: 'Enter' })
  return screen.findByRole('menu')
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  localStorage.clear()
  hiddenJobs.mockResolvedValue({ items: [], total: 0 })
  dismissRecommendation.mockResolvedValue({ listing_id: 'listing-1', created_at: '2026-09-20T00:00:00Z' })
  undismissRecommendation.mockResolvedValue(undefined)
  adoptRecommendation.mockResolvedValue({ id: 'campaign-9' })
  getListing.mockResolvedValue({
    ...LISTING,
    description: 'Build Kubernetes services.\n\nWork with Python every day.',
  })
})

describe('DiscoveryPage', () => {
  it('shows a two-line job row with match, meta and attribution', async () => {
    renderPage()
    const card = await findCard()

    expect(screen.getByRole('heading', { name: 'Discover jobs' })).toBeTruthy()
    expect(within(card).queryByText(LISTING.preview)).toBeNull()
    expect(within(card).getByRole('img', { name: '82% fit' })).toBeTruthy()
    expect(within(card).getByText('2 of 3 skills')).toBeTruthy()
    // Why it fits, in one line: the skills matched and the ones missing.
    expect(within(card).getByText('Kubernetes, Python')).toBeTruthy()
    expect(within(card).getByText('Terraform')).toBeTruthy()
    expect(within(card).getByText('Berlin, Germany')).toBeTruthy()
    expect(within(card).getByText('Remote')).toBeTruthy()
    expect(within(card).getByText('Posted 3 days ago')).toBeTruthy()
    expect(within(card).getByText('via Greenhouse')).toBeTruthy()
    expect(within(card).queryByText(/\d+% match/)).toBeNull()
  })

  it('gives each row its actions and keeps the rest in its overflow menu', async () => {
    renderPage()
    const card = await findCard()

    const buttons = within(card).getAllByRole('button').map((button) => button.textContent?.trim() || button.getAttribute('aria-label'))
    expect(buttons).toEqual(['Platform Engineer', 'Add', 'More actions for Platform Engineer'])
    expect(within(card).queryByRole('link')).toBeNull()

    const menu = await openMenu(card)
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent?.trim())).toEqual([
      'Deep match',
      'Tailor my CV',
      'Apply on company site',
      'Hide this job',
    ])
    const apply = within(menu).getByRole('menuitem', { name: /Apply on company site/ })
    expect(apply.getAttribute('href')).toBe('https://jobs.example/apply/1')
    expect(apply.getAttribute('target')).toBe('_blank')
    expect(apply.getAttribute('rel')).toContain('noopener')
  })

  it('adds the job to Applications and opens it', async () => {
    renderPage()
    const card = await findCard()

    fireEvent.click(within(card).getByRole('button', { name: /Add to applications/ }))

    await waitFor(() => expect(adoptRecommendation).toHaveBeenCalledWith('listing-1'))
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/campaigns/$campaignId',
        params: { campaignId: 'campaign-9' },
      }),
    )
  })

  it('hides a job from the overflow menu and offers undo', async () => {
    renderPage()
    const menu = await openMenu(await findCard())

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Hide this job' }))

    await waitFor(() => expect(dismissRecommendation).toHaveBeenCalledWith('listing-1'))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(undismissRecommendation).toHaveBeenCalledWith('listing-1'))
  })

  it('closes the undo toast when the page unmounts', async () => {
    searchListings.mockResolvedValue(page())
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const tree = (showPage: boolean) => (
      <QueryClientProvider client={client}>
        <ToastProvider>{showPage ? <DiscoveryPage /> : <p>Another page</p>}</ToastProvider>
      </QueryClientProvider>
    )
    const view = render(tree(true))
    const menu = await openMenu(await findCard())
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Hide this job' }))
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeTruthy()
    view.rerender(tree(false))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull())
  })

  it('hands the job to CV Studio through the workflow context', async () => {
    renderPage()
    const menu = await openMenu(await findCard())

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Tailor my CV' }))

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/cv-studio' }))
    expect(getListing).toHaveBeenCalledWith('listing-1')
    const context = readWorkflowContext()
    expect(context?.targetRole).toBe('Platform Engineer')
    expect(context?.jobDescription).toContain('Build Kubernetes services.\n\nWork with Python')
  })

  it('loads the full description as plain text in the details drawer, with every action', async () => {
    getListing.mockResolvedValue({ ...LISTING, description: '<b>Bold</b> claim' })
    renderPage()
    const card = await findCard()

    fireEvent.click(within(card).getByRole('button', { name: 'Platform Engineer' }))

    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('<b>Bold</b> claim')).toBeTruthy()
    expect(getListing).toHaveBeenCalledWith('listing-1')
    expect(dialog.querySelector('b')).toBeNull()
    // One primary, one secondary, the rest in the overflow menu.
    const footer = dialog.querySelector('.kit-panel__footer') as HTMLElement
    expect(within(footer).getAllByRole('button').map((b) => b.textContent?.trim() || b.getAttribute('aria-label'))).toEqual([
      'More actions for Platform Engineer',
      'Deep match',
      'Add to applications',
    ])
    const menu = await openMenu(dialog)
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent?.trim())).toEqual([
      'Tailor my CV',
      'Apply on company site',
      'Hide this job',
    ])
  })

  it('shows matched and missing skills and runs a deep match from the drawer', async () => {
    startDeepMatch.mockResolvedValue({ history_id: 'run-7', match_score: 71, verdict: 'borderline', created_at: '2026-09-30T10:00:00Z' })
    renderPage()
    const card = await findCard()
    fireEvent.click(within(card).getByRole('button', { name: 'Platform Engineer' }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByText('Terraform')).toBeTruthy()
    expect(within(dialog).getByText('Skills to add')).toBeTruthy()
    expect(within(dialog).getByText('Matches your preferences')).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: /^Deep match$/ }))

    await waitFor(() => expect(startDeepMatch).toHaveBeenCalledWith('listing-1'))
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: '/job-match/result/$historyId', params: { historyId: 'run-7' } }),
    )
  })

  it('reopens a listing that already has a deep match instead of running it again', async () => {
    getListing.mockResolvedValue({
      ...LISTING,
      description: 'Body',
      deep_match: { history_id: 'run-3', match_score: 64, verdict: 'borderline', created_at: '2026-09-30T10:00:00Z' },
    })
    renderPage()
    const card = await findCard()
    fireEvent.click(within(card).getByRole('button', { name: 'Platform Engineer' }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.click(await within(dialog).findByRole('button', { name: /View deep match/ }))

    expect(within(dialog).getByText(/64%/).textContent).toContain('borderline')
    expect(startDeepMatch).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith({ to: '/job-match/result/$historyId', params: { historyId: 'run-3' } })
  })

  it('asks the owner to confirm evidence in the drawer instead of showing 0%', async () => {
    renderPage(page({ has_evidence: false, sort: 'newest', items: [{ ...LISTING, skills_fit: null, matched_skills: [], missing_skills: [], preference_hits: [] }] }))
    const card = await findCard()
    fireEvent.click(within(card).getByRole('button', { name: 'Platform Engineer' }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByText(/Confirm your skills in your profile/)).toBeTruthy()
    expect(within(dialog).queryByText(/0%/)).toBeNull()
  })

  it('shows how similar applications went in the drawer, with the sample size', async () => {
    const similar = { role_family: 'Engineering', fit_bucket: 'Strong fit (78%+)', applied: 6, replied: 2 }
    renderPage(page({ items: [{ ...LISTING, similar_applications: similar }] }))
    const card = await findCard()

    expect(within(card).getByRole('img', { name: '82% fit' })).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: 'Platform Engineer' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/2 of 6/).closest('dd')?.textContent).toContain('got a reply')
  })

  it('shows no outcome line when there are too few similar applications', async () => {
    renderPage()
    const card = await findCard()

    expect(within(card).queryByText(/Similar applications of yours/)).toBeNull()
  })

  it('sends filter changes to the search endpoint', async () => {
    renderPage()
    await findCard()

    fireEvent.change(screen.getAllByLabelText('Company')[0], { target: { value: 'Stripe' } })
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Remote only' })[0])
    fireEvent.change(screen.getAllByLabelText('Posted')[0], { target: { value: '7' } })
    fireEvent.change(screen.getByLabelText('Search jobs'), { target: { value: 'python' } })

    await waitFor(() =>
      expect(searchListings).toHaveBeenLastCalledWith(
        expect.objectContaining({
          q: 'python',
          company: 'Stripe',
          remote: true,
          posted_within_days: 7,
          page: 1,
        }),
      ),
    )
  })

  it('pages through results with numbered pagination', async () => {
    searchListings.mockImplementation(async ({ page: number }: { page: number }) =>
      page({ total: 25, limit: 10, page: number, companies: number === 1 ? ['Acme Systems'] : null }),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <DiscoveryPage />
        </ToastProvider>
      </QueryClientProvider>,
    )
    await findCard()
    const pages = screen.getByRole('navigation', { name: 'Pages' })
    expect(within(pages).getByRole('button', { name: 'Page 1' }).getAttribute('aria-current')).toBe('page')
    expect(within(pages).getByRole('button', { name: 'Page 3' })).toBeTruthy()

    fireEvent.click(within(pages).getByRole('button', { name: 'Page 3' }))

    await waitFor(() =>
      expect(searchListings).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3, limit: 10 })),
    )
    await waitFor(() =>
      expect(within(pages).getByRole('button', { name: 'Page 3' }).getAttribute('aria-current')).toBe('page'),
    )
    // Company options come from page 1 and survive paging.
    expect(within(screen.getAllByLabelText('Company')[0]).getByRole('option', { name: 'Acme Systems' })).toBeTruthy()
  })

  it('shows unscored jobs and points to the profile when the user has no confirmed skills', async () => {
    renderPage(page({ has_evidence: false, sort: 'newest', items: [{ ...LISTING, skills_fit: null, matched_skills: [], missing_skills: [], preference_hits: [] }] }))
    const card = await findCard()

    expect(within(card).queryByText(/skills fit/)).toBeNull()
    expect(within(card).queryByText(/\d+%/)).toBeNull()
    expect(screen.getByRole('link', { name: 'Open my profile' }).getAttribute('href')).toBe('/profile')
    expect(screen.queryByRole('combobox', { name: 'Sort' })).toBeNull()
  })

  it('explains an empty result and clears filters', async () => {
    renderPage(page({ items: [], total: 0 }))
    await screen.findByRole('heading', { name: 'Discover jobs' })
    fireEvent.change(screen.getByLabelText('Search jobs'), { target: { value: 'astronaut' } })

    expect(await screen.findByText('No jobs match these filters')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }))
    expect((screen.getByLabelText('Search jobs') as HTMLInputElement).value).toBe('')
  })

  it('opens the drawer from anywhere on the row and marks the row as the current one', async () => {
    renderPage()
    const card = await findCard()

    fireEvent.click(within(card).getByRole('button', { name: 'Platform Engineer' }))

    expect(await screen.findByRole('dialog', { name: 'Platform Engineer' })).toBeTruthy()
    expect(card.getAttribute('aria-current')).toBe('true')
  })

  it('counts the open jobs in the toolbar and says how they are ordered when there is no fit score', async () => {
    renderPage(page({ has_evidence: false, sort: 'newest', total: 12, items: [{ ...LISTING, skills_fit: null }] }))
    await findCard()

    expect(screen.getByText('12 open jobs · newest first').getAttribute('role')).toBe('status')
  })

  it('lets the owner retry when the jobs could not be loaded', async () => {
    searchListings.mockRejectedValueOnce(new Error('boom'))
    renderPage()

    expect(await screen.findByText('Jobs could not be loaded')).toBeTruthy()
    searchListings.mockResolvedValue(page())
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await findCard()).toBeTruthy()
  })

  it('sends the owner to CV Studio when a deep match needs a CV', async () => {
    startDeepMatch.mockRejectedValue(new ApiError('Create a CV first', 409))
    renderPage()
    const menu = await openMenu(await findCard())

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Deep match' }))

    expect(await screen.findByText('Create a CV in CV Studio first.')).toBeTruthy()
    // The banner sits above the list, so it names the job that failed.
    expect(screen.getByText('Deep match for “Platform Engineer”')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open CV Studio' }).getAttribute('href')).toBe('/cv-studio')
  })

  it('shows a first-run empty state when there are no jobs at all', async () => {
    renderPage(page({ items: [], total: 0, companies: [] }))

    expect(await screen.findByText('No jobs yet')).toBeTruthy()
  })
  it('flips the row to Added after adding, and links to the application instead of offering Add again', async () => {
    renderPage()
    const card = await findCard()

    fireEvent.click(within(card).getByRole('button', { name: 'Add to applications' }))

    const link = await within(card).findByRole('link', { name: 'Open application for Platform Engineer' })
    expect(link.getAttribute('href')).toBe('/campaigns/campaign-9')
    expect(within(card).getByText('Added')).toBeTruthy()
    expect(within(card).queryByRole('button', { name: 'Add to applications' })).toBeNull()
  })

  it('shows a job that is already an application as Added from the start', async () => {
    renderPage(page({ items: [{ ...LISTING, application_id: 'app-4' }] }))
    const card = await findCard()

    expect(within(card).getByText('Added')).toBeTruthy()
    expect(within(card).getByRole('link', { name: 'Open application for Platform Engineer' }).getAttribute('href')).toBe('/campaigns/app-4')
    expect(within(card).queryByRole('button', { name: 'Add to applications' })).toBeNull()
  })

  it('sends one request when Add is clicked twice', async () => {
    adoptRecommendation.mockReturnValue(new Promise(() => {}))
    renderPage()
    const card = await findCard()
    const add = within(card).getByRole('button', { name: 'Add to applications' })

    fireEvent.click(add)
    fireEvent.click(add)

    await waitFor(() => expect(adoptRecommendation).toHaveBeenCalledTimes(1))
  })

  it('marks a job posted today as new', async () => {
    renderPage(page({ items: [{ ...LISTING, posted_at: new Date().toISOString() }] }))
    const card = await findCard()

    expect(within(card).getByText('New today')).toBeTruthy()
    expect(within(card).queryByText('Posted today')).toBeNull()
  })

  it('lists the hidden jobs and restores one', async () => {
    hiddenJobs.mockResolvedValue({
      total: 1,
      items: [{ listing_id: 'listing-7', title: 'Data Analyst', company: 'Harbor Health', location: 'Remote', remote: true, posted_at: null, hidden_at: '2026-10-02T09:00:00Z' }],
    })
    renderPage()
    await findCard()

    fireEvent.click(await screen.findByRole('button', { name: 'Hidden jobs, 1' }))

    const sheet = await screen.findByRole('dialog', { name: 'Hidden jobs' })
    expect(within(sheet).getByText('Data Analyst')).toBeTruthy()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Restore Data Analyst' }))

    await waitFor(() => expect(undismissRecommendation).toHaveBeenCalledWith('listing-7'))
  })

  it('offers no hidden-jobs button while nothing is hidden', async () => {
    renderPage()
    await findCard()

    expect(screen.queryByRole('button', { name: /^Hidden jobs/ })).toBeNull()
  })

  it('says why the list is empty after hiding the only job, and where to find it', async () => {
    hiddenJobs.mockResolvedValue({
      total: 1,
      items: [{ listing_id: 'listing-1', title: 'Platform Engineer', company: 'Acme Systems', location: null, remote: null, posted_at: null, hidden_at: '2026-10-02T09:00:00Z' }],
    })
    renderPage(page({ items: [], total: 0 }))

    expect(await screen.findByText('No jobs left to show')).toBeTruthy()
    expect(screen.queryByText('No jobs match these filters')).toBeNull()
    expect(screen.getByRole('button', { name: 'Review hidden jobs' })).toBeTruthy()
  })

  it('explains fit scores once to a user without confirmed skills, and remembers the dismissal', async () => {
    renderPage(page({ has_evidence: false, sort: 'newest', items: [{ ...LISTING, skills_fit: null, matched_skills: [], missing_skills: [], preference_hits: [] }] }))
    await findCard()

    expect(await screen.findByText('Add your skills to see fit scores')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByText('Add your skills to see fit scores')).toBeNull()
    expect(localStorage.getItem('cw:discovery-skills-callout')).toBe('1')
  })
})
