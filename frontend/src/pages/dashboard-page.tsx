import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { DashboardCv } from '#/components/dashboard/DashboardCv'
import { DashboardPipeline } from '#/components/dashboard/DashboardPipeline'
import { DashboardToday, DashboardTodaySkeleton } from '#/components/dashboard/DashboardToday'
import { rememberDashboardLayout, useDashboardLayoutHint, type DashboardLayoutHint } from '#/components/dashboard/dashboardLayoutHint'
import { FavoriteRuns } from '#/components/dashboard/FavoriteRuns'
import { FirstSteps, FirstStepsSkeleton } from '#/components/dashboard/FirstSteps'
import { greetingLead, greetingTitle } from '#/components/dashboard/greeting'
import { RecentRuns } from '#/components/dashboard/RecentRuns'
import { useDashboardCv } from '#/components/dashboard/useDashboardCv'
import { History } from 'lucide-react'
import { Button, EmptyState, List, Page, PageHeader, Panel, Section, Skeleton, Split } from '#/components/kit'
import { OnboardingTour } from '#/components/onboarding/OnboardingTour'
import { useKnownBreakpoint } from '#/hooks/use-breakpoint'
import { useAccountQueriesEnabled } from '#/hooks/useAccountQueriesEnabled'
import { useHistory } from '#/hooks/useHistory'
import { useOnboarding } from '#/hooks/useOnboarding'
import { useSession } from '#/hooks/useSession'
import { useToday } from '#/hooks/useToday'
import { useSessionHint } from '#/lib/auth/sessionHint'
import { warmDashboard } from '#/lib/query/routePrefetch'

export function DashboardPage() {
  const onboarding = useOnboarding()
  const { status, user } = useSession()
  const isAuthenticated = status === 'authenticated'
  const today = useToday()
  const cv = useDashboardCv()
  // Unknown (null) while hydrating: no query starts with a page size the phone would then replace.
  const bp = useKnownBreakpoint()
  const isMobile = bp === 'mobile'
  // Same query as Recent activity (and the same page size), so the greeting costs no request.
  const runs = useHistory({ page: 1, page_size: isMobile ? 3 : 5 }, useAccountQueriesEnabled() && bp !== null)

  // A direct load ran the route loader on the server, which cannot warm anything: start the first-screen
  // queries (the pipeline panel's too, which mounts only once the session answers) alongside /auth/me.
  // After a client navigation the loader already warmed them and they are still fresh, so nothing refetches.
  useEffect(() => {
    warmDashboard()
  }, [])

  // The viewer's own clock decides the greeting; the page only renders once the session is known, on the client.
  const [now] = useState(() => new Date())

  // The tour points at things on this page, so it waits until the page has settled on what it shows (Recent
  // activity too: a newcomer's hides itself once it comes back empty, and the tour would count it).
  const ready = isAuthenticated ? !today.isPending && !cv.stepsPending && !runs.isPending : status === 'guest'
  // Once settled, remember the layout (which section leads, whether the first steps show): the next load draws its
  // loading frames in the same places, so nothing swaps or appears above everything when the data arrives.
  const layout = useDashboardLayoutHint()
  const settledOrder = today.data ? (today.data.needs_action.length > 0 ? 'needs-first' : 'matches-first') : null
  useEffect(() => {
    if (isAuthenticated && settledOrder && !cv.stepsPending) {
      rememberDashboardLayout({ order: settledOrder, firstSteps: cv.showFirstSteps })
    }
  }, [isAuthenticated, settledOrder, cv.stepsPending, cv.showFirstSteps])

  // A browser that was signed in a moment ago: while the session is asked, draw the signed-in page's frames.
  // Null while hydrating: the server cannot see the hint, so both frames render and CSS shows one.
  const sessionHint = useSessionHint()

  // No onboarding tour on mobile: the UI should be self-explanatory.
  const { shouldShow, startTour } = onboarding
  useEffect(() => {
    if (bp !== null && !isMobile && ready && shouldShow) startTour()
  }, [bp, isMobile, ready, shouldShow, startTour])

  // 'unreachable' (a signed-in browser that cannot reach the server) is not a guest: keep the skeleton,
  // the shell's service banner explains the outage and retries.
  // For a browser that was signed in, the skeleton is the dashboard's own two columns and section frames, so
  // the page does not snap from one column into two when it arrives.
  if (status === 'loading' || status === 'unreachable') {
    return <DashboardLoading show={status === 'unreachable' || sessionHint === true ? 'signed-in' : sessionHint === false ? 'guest' : 'either'} />
  }

  const title = isAuthenticated ? greetingTitle(now, user?.full_name) : 'Welcome.'
  const lead = isAuthenticated
    ? greetingLead(now, {
        needsTotal: today.data ? today.data.needs_action_total : null,
        runDates: (runs.data?.items ?? []).map((run) => run.created_at),
      })
    : 'Upload a resume to get started, or sign in to keep your results.'

  return (
    <Page>
      <PageHeader title={title} lead={lead} />
      {isAuthenticated ? (
        <Split
          className="dash-split"
          railLabel="Pipeline and CV"
          rail={
            <>
              <DashboardPipeline />
              <DashboardCv />
              <RecentRuns hideWhenEmpty={cv.isNewcomer} />
              <FavoriteRuns hideWhenEmpty={cv.isNewcomer} />
            </>
          }
        >
          {/* Until all three are done: after the first run it still says what is next (add a job). */}
          {/* An account without applications will see the first steps: their frame holds the place while the CV
              lookup runs, so the page does not grow a panel above everything when it answers. */}
          {cv.showFirstSteps ? (
            <FirstSteps resumeIn={cv.hasResume} analyzed={cv.hasResumeRun} />
          ) : cv.stepsPending && (cv.hasApplications === false || (cv.hasApplications === null && layout?.firstSteps)) ? (
            <FirstStepsSkeleton />
          ) : null}
          <DashboardToday firstSteps={cv.showFirstSteps} hasResume={cv.hasResume} noApplications={cv.hasApplications === false} />
        </Split>
      ) : (
        // The signed-in page's two columns (stacked under 56rem the same way): the first steps lead, Activity sits in
        // the rail where Recent activity will be once signed in.
        <Split
          className="dash-split"
          railLabel="Activity"
          rail={
            <Section title="Activity" data-tour="activity">
              <EmptyState
                icon={<History aria-hidden />}
                title="Your activity lives here"
                description="Sign in to keep your runs, starred results and applications."
                action={
                  <Button asChild variant="secondary">
                    <Link to="/login">Sign in</Link>
                  </Button>
                }
              />
            </Section>
          }
        >
          <FirstSteps signedIn={false} />
        </Split>
      )}
      {!isMobile && (
        <OnboardingTour open={onboarding.open} signedIn={isAuthenticated} onComplete={onboarding.complete} onSkip={onboarding.skip} />
      )}
    </Page>
  )
}

/**
 * The page while the session is asked. A browser that was signed in gets the signed-in dashboard's frames
 * (its header, its two columns and each section's frame); any other gets the plain page skeleton. 'either'
 * (the server's render and the hydration render, which cannot see the localStorage hint) draws both and lets
 * `[data-session-hint]` on <html>, set before the first paint, show one; the next render keeps only that one.
 */
function DashboardLoading({ show }: { show: 'signed-in' | 'guest' | 'either' }) {
  const either = show === 'either'
  const layout = useDashboardLayoutHint()
  return (
    <Page>
      {show !== 'guest' ? (
        <div className="dash-loading" data-when={either ? 'session-hint' : undefined}>
          <DashboardSkeleton layout={layout} />
        </div>
      ) : null}
      {show !== 'signed-in' ? (
        <div className="dash-loading" data-when={either ? 'no-session-hint' : undefined}>
          <Skeleton variant="page" />
        </div>
      ) : null}
    </Page>
  )
}

/**
 * The signed-in dashboard's frames: its header, its two columns and each section's frame, placed as the page last
 * settled in this browser (the first steps on top, Best matches before Needs action) when that is known.
 */
function DashboardSkeleton({ layout }: { layout: DashboardLayoutHint | null }) {
  return (
    <>
      <Skeleton variant="header" width="min(22rem, 70%)" label="Loading" />
      <Split
        className="dash-split"
        railLabel="Pipeline and CV"
        rail={
          <>
            <Section title="Pipeline">
              <Panel flush>
                <List framed={false} aria-busy aria-label="Applications by stage">
                  <Skeleton variant="row" as="li" density="compact" leading="tile" count={5} />
                </List>
              </Panel>
            </Section>
            <Section title="Recent activity">
              <List aria-busy aria-label="Recent activity">
                <Skeleton variant="row" as="li" count={3} />
              </List>
            </Section>
          </>
        }
      >
        {layout?.firstSteps ? <FirstStepsSkeleton /> : null}
        <DashboardTodaySkeleton order={layout?.order} />
      </Split>
    </>
  )
}
