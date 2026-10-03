import { useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { DashboardCv } from '#/components/dashboard/DashboardCv'
import { DashboardPipeline } from '#/components/dashboard/DashboardPipeline'
import { DashboardResumeUpload } from '#/components/dashboard/DashboardResumeUpload'
import { DashboardToday } from '#/components/dashboard/DashboardToday'
import { FavoriteRuns } from '#/components/dashboard/FavoriteRuns'
import { RecentRuns } from '#/components/dashboard/RecentRuns'
import { useDashboardCv } from '#/components/dashboard/useDashboardCv'
import { Button, EmptyState, Page, PageHeader, Section, Skeleton, Split } from '#/components/kit'
import { OnboardingTour } from '#/components/onboarding/OnboardingTour'
import { useOnboarding } from '#/hooks/useOnboarding'
import { useSession } from '#/hooks/useSession'
import { useToday } from '#/hooks/useToday'
import { useBreakpoint } from '#/hooks/use-breakpoint'

export function DashboardPage() {
  const onboarding = useOnboarding()
  const { status } = useSession()
  const isAuthenticated = status === 'authenticated'
  const today = useToday()
  const cv = useDashboardCv()
  const isMobile = useBreakpoint() === 'mobile'

  // The tour points at things on this page, so it waits until the page has settled on what it shows.
  const ready = isAuthenticated ? !today.isPending && !cv.pending : status === 'guest'

  // No onboarding tour on mobile: the UI should be self-explanatory.
  const { shouldShow, startTour } = onboarding
  useEffect(() => {
    if (!isMobile && ready && shouldShow) startTour()
  }, [isMobile, ready, shouldShow, startTour])

  if (status === 'loading') {
    return (
      <Page>
        <Skeleton variant="page" />
      </Page>
    )
  }

  const start = (
    <Section title="Upload your resume">
      <DashboardResumeUpload />
    </Section>
  )

  return (
    <Page>
      <PageHeader title="Dashboard" />
      {isAuthenticated ? (
        <Split
          railLabel="Pipeline and CV"
          rail={
            <>
              <DashboardPipeline />
              <DashboardCv />
              <FavoriteRuns />
            </>
          }
        >
          {cv.isNewcomer ? start : null}
          <DashboardToday />
          <div data-tour="activity">
            <RecentRuns />
          </div>
        </Split>
      ) : (
        <>
          {start}
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
