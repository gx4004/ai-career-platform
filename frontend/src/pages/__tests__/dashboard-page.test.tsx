import type { ReactNode } from 'react'
import { act, render, screen, within } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSessionHint, markSessionHint } from '#/lib/auth/sessionHint'
import { DashboardPage } from '#/pages/dashboard-page'

const session = vi.hoisted(() => ({ status: 'authenticated', user: { full_name: 'Alex Morgan' } as { full_name: string | null } | null }))
const runs = vi.hoisted(() => ({ current: { data: { items: [{ created_at: '2026-10-03T10:00:00' }, { created_at: '2026-10-03T09:00:00' }] } } }))
const today = vi.hoisted(() => ({ current: { isPending: false, data: undefined as unknown } }))
const cv = vi.hoisted(() => ({
  current: { pending: false, stepsPending: false, isNewcomer: false, showFirstSteps: false, latest: null, hasResume: true, hasResumeRun: true } as Record<string, unknown>,
}))
const onboarding = vi.hoisted(() => ({
  current: { open: false, shouldShow: true, startTour: vi.fn(), complete: vi.fn(), skip: vi.fn() },
}))
const breakpoint = vi.hoisted(() => ({ current: 'desktop' }))
const signedInHint = vi.hoisted(() => ({ current: false }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock('#/hooks/useSession', () => ({ useSession: () => ({ status: session.status, user: session.user }) }))
vi.mock('#/hooks/useHistory', () => ({ useHistory: () => runs.current }))
vi.mock('#/hooks/useToday', () => ({ useToday: () => today.current }))
vi.mock('#/hooks/useOnboarding', () => ({ useOnboarding: () => onboarding.current }))
vi.mock('#/hooks/use-breakpoint', () => ({ useKnownBreakpoint: () => breakpoint.current }))
vi.mock('#/hooks/useAccountQueriesEnabled', () => ({
  useAccountQueriesEnabled: () => session.status === 'authenticated' || (session.status === 'loading' && signedInHint.current),
}))
vi.mock('#/lib/query/routePrefetch', () => ({ warmDashboard: () => {} }))
vi.mock('#/components/dashboard/useDashboardCv', () => ({ useDashboardCv: () => cv.current }))
vi.mock('#/components/dashboard/DashboardToday', () => ({
  DashboardToday: (props: { firstSteps?: boolean }) => <div data-testid="today" data-first-steps={String(Boolean(props.firstSteps))} />,
  DashboardTodaySkeleton: () => <div data-testid="today-skeleton" />,
}))
vi.mock('#/components/dashboard/DashboardPipeline', () => ({ DashboardPipeline: () => <div data-testid="pipeline" /> }))
vi.mock('#/components/dashboard/DashboardCv', () => ({ DashboardCv: () => <div data-testid="cv" /> }))
vi.mock('#/components/dashboard/RecentRuns', () => ({ RecentRuns: () => <div data-testid="recent" /> }))
vi.mock('#/components/dashboard/FavoriteRuns', () => ({ FavoriteRuns: () => <div data-testid="starred" /> }))
vi.mock('#/components/dashboard/DashboardResumeUpload', () => ({
  DashboardResumeUpload: () => <div data-testid="upload" />,
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
    cv.current = { pending: false, stepsPending: false, isNewcomer: false, showFirstSteps: false, latest: null, hasResume: true, hasResumeRun: true }
    onboarding.current = { open: false, shouldShow: true, startTour: vi.fn(), complete: vi.fn(), skip: vi.fn() }
    breakpoint.current = 'desktop'
    signedInHint.current = false
    clearSessionHint()
    window.localStorage.removeItem('cw:dashboard-layout')
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
    // The day and month (and "Oct 3") are joined by no-break spaces, so a phone never breaks a date (r4 chrome-F11).
    expect(lead).toMatch(/^Two things need you today\. \w+day \d{1,2}\u00a0\w+; your last two runs were on Oct\u00a03\.$/)
  })

  it('greets without a name when none is known, and says nothing about needs while the plan is loading', () => {
    session.user = { full_name: null }
    today.current = { isPending: true, data: undefined }
    runs.current = { data: { items: [] } }
    render(<DashboardPage />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^(Morning|Afternoon|Evening)\.$/)
    expect(document.querySelector('.kit-page-header__lead')?.textContent).toMatch(/^\w+day \d{1,2}\u00a0\w+\.$/)
  })

  it('leads with the resume upload for a newcomer, and has none for someone with a CV', () => {
    cv.current = { pending: false, stepsPending: false, isNewcomer: true, showFirstSteps: true, latest: null, hasResume: false, hasResumeRun: false }
    const { unmount } = render(<DashboardPage />)
    expect(screen.getByRole('heading', { name: 'Your first 3 steps' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Upload your resume' })).toBeTruthy()
    expect(screen.getByTestId('upload')).toBeTruthy()
    unmount()

    cv.current = { pending: false, stepsPending: false, isNewcomer: false, showFirstSteps: false, latest: null, hasResume: true, hasResumeRun: true }
    render(<DashboardPage />)
    expect(screen.queryByTestId('upload')).toBeNull()
  })

  it('keeps the first steps after the first run, ticked off up to "add a job", and tells the sections', () => {
    cv.current = { pending: false, stepsPending: false, isNewcomer: false, showFirstSteps: true, latest: null, hasResume: true, hasResumeRun: true }
    render(<DashboardPage />)
    expect(screen.getByRole('heading', { name: 'Your first 3 steps' })).toBeTruthy()
    expect(screen.getAllByRole('listitem').map((step) => step.getAttribute('data-state'))).toEqual(['done', 'done', 'current'])
    expect(screen.queryByTestId('upload')).toBeNull()
    expect(screen.getByTestId('today').getAttribute('data-first-steps')).toBe('true')
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
    cv.current = { pending: true, stepsPending: true, isNewcomer: false, showFirstSteps: false, latest: null, hasResume: false, hasResumeRun: false }
    render(<DashboardPage />)
    expect(onboarding.current.startTour).not.toHaveBeenCalled()
  })

  // Sign-off chrome-F36: a newcomer's Recent activity hides itself once it comes back empty; the tour must not
  // count it while it is still loading.
  it('waits for Recent activity before starting the tour', () => {
    const before = runs.current
    runs.current = { ...before, isPending: true } as typeof before
    try {
      const { rerender } = render(<DashboardPage />)
      expect(onboarding.current.startTour).not.toHaveBeenCalled()

      runs.current = { ...before, isPending: false } as typeof before
      rerender(<DashboardPage />)
      expect(onboarding.current.startTour).toHaveBeenCalled()
    } finally {
      runs.current = before
    }
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

  // Sign-off r4 chrome-F13: the guest page was one 1095px column (a 990px dropzone, a full-width die-cut) while every
  // signed-in state used the two-column Split; it now uses the same Split, which stacks under 56rem the same way.
  it('lays a guest page out in the same two columns: first steps, then Activity in the rail', () => {
    session.status = 'guest'
    session.user = null
    render(<DashboardPage />)

    const rail = screen.getByRole('complementary', { name: 'Activity' })
    expect(rail.contains(screen.getByRole('heading', { name: 'Activity' }))).toBe(true)
    expect(rail.contains(screen.getByTestId('upload'))).toBe(false)
  })

  it('shows a loading skeleton, not the guest view, while the session is being checked', () => {
    session.status = 'loading'
    render(<DashboardPage />)

    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy()
    expect(screen.queryByTestId('upload')).toBeNull()
  })

  it('draws the signed-in two columns while a browser that was signed in waits for the session', () => {
    session.status = 'loading'
    signedInHint.current = true
    markSessionHint()
    render(<DashboardPage />)

    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy()
    expect(screen.getByRole('complementary', { name: 'Pipeline and CV' })).toBeTruthy()
    expect(screen.getByTestId('today-skeleton')).toBeTruthy()
  })

  // Sign-off chrome-F41: the loading frames are drawn where the page last settled in this browser, so the first
  // steps do not appear above everything (and the sections do not swap) when the data arrives.
  it('remembers how the page settled and draws the next loading frames in the same places', () => {
    cv.current = { pending: false, stepsPending: false, isNewcomer: true, showFirstSteps: true, latest: null, hasResume: false, hasResumeRun: false }
    today.current = { isPending: false, data: plan({ needs_action: [], needs_action_total: 0 }) }
    const { unmount } = render(<DashboardPage />)
    expect(JSON.parse(window.localStorage.getItem('cw:dashboard-layout') ?? 'null')).toEqual({ order: 'matches-first', firstSteps: true })
    unmount()

    session.status = 'loading'
    signedInHint.current = true
    markSessionHint()
    render(<DashboardPage />)
    const frame = screen.getByRole('heading', { name: 'Your first 3 steps' })
    expect(frame.compareDocumentPosition(screen.getByTestId('today-skeleton')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  // Sign-off chrome-F33: the server cannot read the localStorage hint, so a returning browser's hydration
  // render used to draw the two-column skeleton over the server's one-column one and React threw the tree away.
  it('hydrates a returning browser without a mismatch, then keeps only its two-column skeleton', async () => {
    session.status = 'loading'
    const html = renderToString(<DashboardPage />) // what a server, which never sees the hint, sends
    markSessionHint() // the browser holds it
    signedInHint.current = true
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)
    const recoverable: unknown[] = []
    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(container, <DashboardPage />, { onRecoverableError: (error) => recoverable.push(error) })
    })
    try {
      expect(recoverable).toEqual([])
      const view = within(container)
      expect(view.getByRole('complementary', { name: 'Pipeline and CV' })).toBeTruthy()
      expect(view.getByTestId('today-skeleton')).toBeTruthy()
      // Only the two-column frames stay once the browser has answered.
      expect(view.getAllByRole('status', { name: 'Loading' })).toHaveLength(1)
    } finally {
      act(() => root?.unmount())
      container.remove()
    }
  })

  it('gives the guest activity box the die-cut disc and a short title', () => {
    session.status = 'guest'
    session.user = null
    const { container } = render(<DashboardPage />)
    expect(screen.getByText('Your activity lives here')).toBeTruthy()
    expect(container.querySelector('[data-tour="activity"] .kit-empty__icon')).toBeTruthy()
  })
})
