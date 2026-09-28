import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DiscoveryPage } from '#/pages/discovery-page'
import { readWorkflowContext } from '#/lib/tools/drafts'

const searchListings = vi.hoisted(() => vi.fn())
const dismissRecommendation = vi.hoisted(() => vi.fn())
const undismissRecommendation = vi.hoisted(() => vi.fn())
const adoptRecommendation = vi.hoisted(() => vi.fn())
const getListing = vi.hoisted(() => vi.fn())
const navigate = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/client', () => ({
  searchDiscoveryListings: searchListings,
  dismissDiscoveryRecommendation: dismissRecommendation,
  undismissDiscoveryRecommendation: undismissRecommendation,
  adoptDiscoveryRecommendation: adoptRecommendation,
  getDiscoveryListing: getListing,
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
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
  score: 82,
  matched_keywords: ['Kubernetes', 'Python'],
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
    has_profile: true,
    companies: ['Acme Systems', 'Stripe'],
    ...overrides,
  }
}

function renderPage(payload: unknown = page()) {
  searchListings.mockResolvedValue(payload)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DiscoveryPage />
    </QueryClientProvider>,
  )
}

const findCard = () => screen.findByRole('article', { name: 'Platform Engineer' }, { timeout: 5_000 })

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  dismissRecommendation.mockResolvedValue({ listing_id: 'listing-1', created_at: '2026-09-20T00:00:00Z' })
  undismissRecommendation.mockResolvedValue(undefined)
  adoptRecommendation.mockResolvedValue({ id: 'campaign-9' })
  getListing.mockResolvedValue({
    ...LISTING,
    description: 'Build Kubernetes services.\n\nWork with Python every day.',
  })
})

describe('DiscoveryPage', () => {
  it('shows a job card with match, meta, preview and attribution', async () => {
    renderPage()
    const card = await findCard()

    expect(screen.getByRole('heading', { name: 'Discover jobs' })).toBeTruthy()
    expect(within(card).getByText(LISTING.preview)).toBeTruthy()
    expect(within(card).getByLabelText('82% match')).toBeTruthy()
    expect(within(card).getByText('Berlin, Germany')).toBeTruthy()
    expect(within(card).getByText('Remote')).toBeTruthy()
    expect(within(card).getByText('Posted 3 days ago')).toBeTruthy()
    expect(within(card).getByText('Kubernetes')).toBeTruthy()
    expect(within(card).getByText('via Greenhouse')).toBeTruthy()
  })

  it('opens the apply link in a new tab without leaking the opener', async () => {
    renderPage()
    const card = await findCard()

    const apply = within(card).getByRole('link', { name: /Apply on company site/ })
    expect(apply.getAttribute('href')).toBe('https://jobs.example/apply/1')
    expect(apply.getAttribute('target')).toBe('_blank')
    expect(apply.getAttribute('rel')).toContain('noopener')
  })

  it('sends filter changes to the search endpoint', async () => {
    renderPage()
    await findCard()

    fireEvent.change(screen.getAllByLabelText('Company')[0], { target: { value: 'Stripe' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Remote only' })[0])
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

  it('hands the job to CV Studio through the workflow context', async () => {
    renderPage()
    const card = await findCard()

    fireEvent.click(within(card).getByRole('button', { name: /Tailor my CV/ }))

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/cv-studio' }))
    expect(getListing).toHaveBeenCalledWith('listing-1')
    const context = readWorkflowContext()
    expect(context?.targetRole).toBe('Platform Engineer')
    expect(context?.jobDescription).toContain('Build Kubernetes services.\n\nWork with Python')
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

  it('hides a job and offers undo', async () => {
    renderPage()
    const card = await findCard()

    fireEvent.click(within(card).getByRole('button', { name: 'Hide Platform Engineer' }))

    await waitFor(() => expect(dismissRecommendation).toHaveBeenCalledWith('listing-1'))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(undismissRecommendation).toHaveBeenCalledWith('listing-1'))
  })

  it('fetches the full description and shows it as plain text in a details panel', async () => {
    getListing.mockResolvedValue({ ...LISTING, description: '<b>Bold</b> claim' })
    renderPage()
    const card = await findCard()

    fireEvent.click(within(card).getByRole('button', { name: 'Platform Engineer' }))

    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('<b>Bold</b> claim')).toBeTruthy()
    expect(getListing).toHaveBeenCalledWith('listing-1')
    expect(dialog.querySelector('b')).toBeNull()
  })

  it('shows unscored jobs and a profile nudge when the user has no confirmed skills', async () => {
    renderPage(page({ has_profile: false, sort: 'newest', items: [{ ...LISTING, score: null, matched_keywords: [] }] }))
    const card = await findCard()

    expect(within(card).queryByText(/match/)).toBeNull()
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

  it('shows a first-run empty state when there are no jobs at all', async () => {
    renderPage(page({ items: [], total: 0, companies: [] }))

    expect(await screen.findByText('No jobs yet')).toBeTruthy()
  })

  it('loads the next page on demand', async () => {
    renderPage(page({ total: 45 }))
    await findCard()

    fireEvent.click(screen.getByRole('button', { name: 'Show more jobs' }))

    await waitFor(() =>
      expect(searchListings).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })),
    )
  })
})
