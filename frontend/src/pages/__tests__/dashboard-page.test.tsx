import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from '#/pages/dashboard-page'

const session = vi.hoisted(() => ({ status: 'authenticated', user: { full_name: 'Alex Morgan' } as { full_name: string | null } | null }))
const runs = vi.hoisted(() => ({ current: { data: { items: [{ created_at: '2026-10-03T10:00:00' }, { created_at: '2026-10-03T09:00:00' }] } } }))
const today = vi.hoisted(() => ({ current: { isPending: false, data: undefined as unknown } }))
const cv = vi.hoisted(() => ({ current: { pending: false, isNewcomer: false, latest: null, hasResumeRun: true } }))
const onboarding = vi.hoisted(() => ({
  current: { open: false, shouldShow: true, startTour: vi.fn(), complete: vi.fn(), skip: vi.fn() },
}))
const breakpoint = vi.hoisted(() => ({ current: 'desktop' }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock('#/hooks/useSession', () => ({ useSession: () => ({ status: session.status, user: session.user }) }))
vi.mock('#/hooks/useHistory', () => ({ useHistory: () => runs.current }))
vi.mock('#/hooks/useToday', () => ({ useToday: () => today.current }))
vi.mock('#/hooks/useOnboarding', () => ({ useOnboarding: () => onboarding.current }))
vi.mock('#/hooks/use-breakpoint', () => ({ useBreakpoint: () => breakpoint.current }))
vi.mock('#/components/dashboard/useDashboardCv', () => ({ useDashboardCv: () => cv.current }))
vi.mock('#/components/dashboard/DashboardToday', () => ({ DashboardToday: () => <div data-testid="today" /> }))
vi.mock('#/components/dashboard/DashboardPipeline', () => ({ DashboardPipeline: () => <div data-testid="pipeline" /> }))
vi.mock('#/components/dashboard/DashboardCv', () => ({ DashboardCv: () => <div data-testid="cv" /> }))
vi.mock('#/components/dashboard/RecentRuns', () => ({ RecentRuns: () => <div data-testid="recent" /> }))
vi.mock('#/components/dashboard/FavoriteRuns', () => ({ FavoriteRuns: () => <div data-testid="starred" /> }))
vi.mock('#/components/dashboard/DashboardResumeUpload', () => ({
  DashboardResumeUpload: () => <div data-testid="upload" data-tour="hero-cta" />,
}))
vi.mock('#/components/onboarding/OnboardingTour', () => ({ OnboardingTour: () => <div data-testid="tour" /> }))

const plan = (over: Record<string, unknown> = {}) => ({
  has_sources: true,
  has_evidence: true,
  best_matches: [{}, {}, {}],
  needs_action: [],
  needs_action_total: 2,
  ...over,
})

describe('DashboardPage', () => {
  beforeEach(() => {
    session.status = 'authenticated'
    session.user = { full_name: 'Alex Morgan' }
    today.current = { isPending: false, data: plan() }
    cv.current = { pending: false, isNewcomer: false, latest: null, hasResumeRun: true }
    onboarding.current = { open: false, shouldShow: true, startTour: vi.fn(), complete: vi.fn(), skip: vi.fn() }
    breakpoint.current = 'desktop'
  })

  it('is one page: a main landmark with the greeting as its h1, then the sections', () => {
    render(<DashboardPage />)

    const main = screen.getByRole('main')
    expect(main.id).toBe('main-content')
    expect(screen.getByRole('heading', { level: 1, name: /^(Morning|Afternoon|Evening), Alex\.$/ })).toBeTruthy()
    expect(screen.getByTestId('today')).toBeTruthy()
    expect(screen.getByTestId('recent')).toBeTruthy()
    expect(screen.getByRole('complementary', { name: 'Pipeline and CV' }).contains(screen.getByTestId('pipeline'))).toBe(true)
  })

  it('derives the line under the greeting from the data: what needs you, today, the last runs', () => {
    render(<DashboardPage />)
    const lead = document.querySelector('.kit-page-header__lead')?.textContent ?? ''
    expect(lead).toMatch(/^Two things need you today\. \w+day \d{1,2} \w+; your last two runs were on Oct 3\.$/)
  })

  it('greets without a name when none is known, and says nothing about needs while the plan is loading', () => {
    session.user = { full_name: null }
    today.current = { isPending: true, data: undefined }
    runs.current = { data: { items: [] } }
    render(<DashboardPage />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^(Morning|Afternoon|Evening)\.$/)
    expect(document.querySelector('.kit-page-header__lead')?.textContent).toMatch(/^\w+day \d{1,2} \w+\.$/)
  })

  it('leads with the resume upload for a newcomer, and has none for someone with a CV', () => {
    cv.current = { pending: false, isNewcomer: true, latest: null, hasResumeRun: false }
    const { unmount } = render(<DashboardPage />)
    expect(screen.getByRole('heading', { name: 'Your first 3 steps' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Upload your resume' })).toBeTruthy()
    expect(screen.getByTestId('upload')).toBeTruthy()
    unmount()

    cv.current = { pending: false, isNewcomer: false, latest: null, hasResumeRun: true }
    render(<DashboardPage />)
    expect(screen.queryByTestId('upload')).toBeNull()
  })

  it('starts the tour once the page has settled, and not before', () => {
    today.current = { isPending: true, data: undefined }
    const { rerender } = render(<DashboardPage />)
    expect(onboarding.current.startTour).not.toHaveBeenCalled()

    today.current = { isPending: false, data: plan() }
    rerender(<DashboardPage />)
    expect(onboarding.current.startTour).toHaveBeenCalled()
  })

  it('waits for the CV lookup before starting the tour, so the step list is final', () => {
    cv.current = { pending: true, isNewcomer: false, latest: null, hasResumeRun: false }
    render(<DashboardPage />)
    expect(onboarding.current.startTour).not.toHaveBeenCalled()
  })

  it('does not start the tour on phones or when it has been seen', () => {
    breakpoint.current = 'mobile'
    const { unmount } = render(<DashboardPage />)
    expect(onboarding.current.startTour).not.toHaveBeenCalled()
    expect(screen.queryByTestId('tour')).toBeNull()
    unmount()

    breakpoint.current = 'desktop'
    onboarding.current.shouldShow = false
    render(<DashboardPage />)
    expect(onboarding.current.startTour).not.toHaveBeenCalled()
  })

  it('shows a guest the upload and a sign-in prompt instead of the signed-in sections', () => {
    session.status = 'guest'
    session.user = null
    render(<DashboardPage />)

    expect(screen.getByRole('heading', { level: 1, name: 'Welcome.' })).toBeTruthy()
    expect(screen.getByTestId('upload')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Activity' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login')
    expect(screen.queryByTestId('today')).toBeNull()
    expect(screen.queryByTestId('pipeline')).toBeNull()
    expect(onboarding.current.startTour).toHaveBeenCalled()
  })

  it('shows a loading skeleton, not the guest view, while the session is being checked', () => {
    session.status = 'loading'
    render(<DashboardPage />)

    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy()
    expect(screen.queryByTestId('upload')).toBeNull()
  })
})
