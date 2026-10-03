import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from '#/pages/dashboard-page'

const session = vi.hoisted(() => ({ status: 'authenticated' }))
const today = vi.hoisted(() => ({ current: { isPending: false, data: undefined as unknown } }))
const cv = vi.hoisted(() => ({ current: { pending: false, isNewcomer: false, latest: null, hasResumeRun: true } }))
const onboarding = vi.hoisted(() => ({
  current: { open: false, shouldShow: true, startTour: vi.fn(), complete: vi.fn(), skip: vi.fn() },
}))
const breakpoint = vi.hoisted(() => ({ current: 'desktop' }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock('#/hooks/useSession', () => ({ useSession: () => ({ status: session.status }) }))
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
    today.current = { isPending: false, data: plan() }
    cv.current = { pending: false, isNewcomer: false, latest: null, hasResumeRun: true }
    onboarding.current = { open: false, shouldShow: true, startTour: vi.fn(), complete: vi.fn(), skip: vi.fn() }
    breakpoint.current = 'desktop'
  })

  it('is one page: a main landmark with the title as its h1, then the sections', () => {
    render(<DashboardPage />)

    const main = screen.getByRole('main')
    expect(main.id).toBe('main-content')
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy()
    expect(screen.getByTestId('today')).toBeTruthy()
    expect(screen.getByTestId('recent')).toBeTruthy()
    expect(screen.getByRole('complementary', { name: 'Pipeline and CV' }).contains(screen.getByTestId('pipeline'))).toBe(true)
  })

  it('keeps the header to the title: the counts are in the sections below it', () => {
    render(<DashboardPage />)
    expect(screen.queryByText(/matches to add/)).toBeNull()
    expect(screen.queryByText(/need action/)).toBeNull()
  })

  it('leads with the resume upload for a newcomer, and has none for someone with a CV', () => {
    cv.current = { pending: false, isNewcomer: true, latest: null, hasResumeRun: false }
    const { unmount } = render(<DashboardPage />)
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
    render(<DashboardPage />)

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
