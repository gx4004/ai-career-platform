import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { DashboardCv } from '#/components/dashboard/DashboardCv'
import { DashboardPipeline } from '#/components/dashboard/DashboardPipeline'
import { DashboardToday } from '#/components/dashboard/DashboardToday'
import { FavoriteRuns } from '#/components/dashboard/FavoriteRuns'
import { FirstSteps } from '#/components/dashboard/FirstSteps'
import { greetingLead, greetingTitle } from '#/components/dashboard/greeting'
import { RecentRuns } from '#/components/dashboard/RecentRuns'
import { useDashboardCv } from '#/components/dashboard/useDashboardCv'
import { Button, EmptyState, Page, PageHeader, Section, Skeleton, Split } from '#/components/kit'
import { OnboardingTour } from '#/components/onboarding/OnboardingTour'
import { useKnownBreakpoint } from '#/hooks/use-breakpoint'
import { useAccountQueriesEnabled } from '#/hooks/useAccountQueriesEnabled'
import { useHistory } from '#/hooks/useHistory'
import { useOnboarding } from '#/hooks/useOnboarding'
import { useSession } from '#/hooks/useSession'
import { useToday } from '#/hooks/useToday'
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

  // The tour points at things on this page, so it waits until the page has settled on what it shows.
  const ready = isAuthenticated ? !today.isPending && !cv.pending : status === 'guest'

  // No onboarding tour on mobile: the UI should be self-explanatory.
  const { shouldShow, startTour } = onboarding
  useEffect(() => {
    if (bp !== null && !isMobile && ready && shouldShow) startTour()
  }, [bp, isMobile, ready, shouldShow, startTour])

  // 'unreachable' (a signed-in browser that cannot reach the server) is not a guest: keep the skeleton,
  // the shell's service banner explains the outage and retries.
  if (status === 'loading' || status === 'unreachable') {
    return (
      <Page>
        <Skeleton variant="page" />
      </Page>
    )
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
          {cv.isNewcomer ? <FirstSteps /> : null}
          <DashboardToday />
        </Split>
      ) : (
        <>
          <FirstSteps signedIn={false} />
          <Section title="Activity" data-tour="activity">
            <EmptyState
              title="Sign in to track your runs, favorites and applications."
              action={
                <Button asChild variant="secondary" size="sm">
                  <Link to="/login">Sign in</Link>
                </Button>
              }
            />
          </Section>
        </>
      )}
      {!isMobile && (
        <OnboardingTour open={onboarding.open} onComplete={onboarding.complete} onSkip={onboarding.skip} />
      )}
    </Page>
  )
}
