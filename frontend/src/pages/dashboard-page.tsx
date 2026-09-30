import { useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { DashboardCv } from '#/components/dashboard/DashboardCv'
import { DashboardToday } from '#/components/dashboard/DashboardToday'
import { DashboardPipeline } from '#/components/dashboard/DashboardPipeline'
import { FavoriteRuns } from '#/components/dashboard/FavoriteRuns'
import { RecentRuns } from '#/components/dashboard/RecentRuns'
import { PageFrame } from '#/components/app/PageFrame'
import { PageHero } from '#/components/app/PageHero'
import { OnboardingTour } from '#/components/onboarding/OnboardingTour'
import { useOnboarding } from '#/hooks/useOnboarding'
import { useSession } from '#/hooks/useSession'
import { useToday } from '#/hooks/useToday'
import { useBreakpoint } from '#/hooks/use-breakpoint'

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function DashboardPage() {
  const onboarding = useOnboarding()
  const { status } = useSession()
  const isAuthenticated = status === 'authenticated'
  const today = useToday().data
  const bp = useBreakpoint()
  const isMobile = bp === 'mobile'

  // No onboarding tour on mobile — UI should be self-explanatory
  useEffect(() => {
    if (!isMobile && onboarding.shouldShow) {
      onboarding.startTour()
    }
  }, [isMobile]) // eslint-disable-line react-hooks/exhaustive-deps

  const meta = today
    ? [
        countLabel(today.best_matches.length, 'match to add', 'matches to add'),
        countLabel(today.needs_action_total, 'application needs action', 'applications need action'),
      ]
    : undefined

  return (
    <PageFrame className="dashboard-page-frame">
      <div className="dash">
        <PageHero
          title="Dashboard"
          chips={meta}
        />
        {isAuthenticated ? <DashboardToday /> : null}
        {isAuthenticated ? <DashboardPipeline /> : null}
        <DashboardCv />
        <div className="dash-columns">
          {isAuthenticated ? (
            <>
              <div data-tour="activity"><RecentRuns /></div>
              <FavoriteRuns />
            </>
          ) : (
            <section className="dash-section" data-tour="activity">
              <div className="dash-section__head">
                <h2 className="dash-section__title">Activity</h2>
              </div>
              <p className="dash-empty">
                <Link to="/login">Sign in</Link> to track your runs, favorites and applications.
              </p>
            </section>
          )}
        </div>
      </div>
      {!isMobile && (
        <OnboardingTour
          open={onboarding.open}
          onComplete={onboarding.complete}
          onSkip={onboarding.skip}
        />
      )}
    </PageFrame>
  )
}
