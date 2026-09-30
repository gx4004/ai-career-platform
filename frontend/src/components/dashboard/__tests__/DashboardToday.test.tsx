import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
vi.mock('#/components/ui/motion', () => ({
  ScrollFadeUp: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
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
})
