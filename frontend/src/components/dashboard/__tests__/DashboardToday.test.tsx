import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardToday } from '#/components/dashboard/DashboardToday'

const getToday = vi.hoisted(() => vi.fn())
const adopt = vi.hoisted(() => vi.fn())
const navigate = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/client', () => ({
  getToday,
  adoptDiscoveryRecommendation: adopt,
}))
vi.mock('#/hooks/useSession', () => ({ useSession: () => ({ status: 'authenticated' }) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, ...props }: { children: ReactNode; to: string; params?: Record<string, string> } & Record<string, unknown>) => (
    <a href={params ? to.replace('$campaignId', params.campaignId) : to} {...props}>{children}</a>
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
    needs_action: [],
    needs_action_total: 0,
    ...overrides,
  }
}

function renderToday() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DashboardToday />
    </QueryClientProvider>,
  )
}

describe('DashboardToday', () => {
  beforeEach(() => {
    getToday.mockReset()
    adopt.mockReset()
    navigate.mockReset()
  })

  it('shows a match with its skills fit sample and adds it to applications', async () => {
    getToday.mockResolvedValue(plan())
    adopt.mockResolvedValue({ id: 'app-1' })
    renderToday()

    expect(await screen.findByText('Platform Engineer')).toBeTruthy()
    expect(screen.getByRole('img', { name: '82% fit' })).toBeTruthy()
    expect(screen.getByText('4 of 5 skills')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Platform Engineer/ }).getAttribute('href')).toBe(
      LISTING.source_url,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add Platform Engineer to applications' }))

    await waitFor(() => expect(adopt.mock.calls[0][0]).toBe('listing-1'))
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/campaigns/$campaignId',
        params: { campaignId: 'app-1' },
      }),
    )
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

  it('asks to confirm evidence when there is none', async () => {
    getToday.mockResolvedValue(plan({ has_evidence: false, best_matches: [] }))
    renderToday()

    expect(await screen.findByText('Confirm your skills first')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Confirm evidence' }).getAttribute('href')).toBe('/profile')
  })

  it('calls only fair-or-better fits "best" and labels the rest as the closest', async () => {
    const weak = { ...LISTING, listing_id: 'listing-2', title: 'Data Engineer', skills_fit: 50 }
    getToday.mockResolvedValue(plan({ best_matches: [LISTING, weak] }))
    const { unmount } = renderToday()

    expect(await screen.findByText('Platform Engineer')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: /^Best matches to add/ })).toBeTruthy()
    expect(screen.queryByText('Data Engineer')).toBeNull()
    unmount()

    getToday.mockResolvedValue(plan({ best_matches: [weak] }))
    renderToday()
    expect(await screen.findByText('Data Engineer')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: /^Closest matches to add/ })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /^Best matches to add/ })).toBeNull()
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

    expect((await screen.findByRole('alert')).textContent).toContain('That job could not be added')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('shows busy lists while loading and an error with a retry when it fails', async () => {
    let reject: (error: Error) => void = () => {}
    getToday.mockReturnValue(new Promise((_, rej) => { reject = rej }))
    renderToday()

    const busy = screen.getAllByRole('list', { hidden: true }).filter((list) => list.getAttribute('aria-busy') === 'true')
    expect(busy.length).toBe(2)

    reject(new Error('down'))
    expect((await screen.findByRole('alert')).textContent).toContain("couldn't be loaded")
    getToday.mockResolvedValue(plan())
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Platform Engineer')).toBeTruthy()
  })
})
