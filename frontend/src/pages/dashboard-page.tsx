import { useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { DashboardResumeUpload } from '#/components/dashboard/DashboardResumeUpload'
import { DashboardToday } from '#/components/dashboard/DashboardToday'
import { DashboardTools } from '#/components/dashboard/DashboardTools'
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
          purpose={isAuthenticated ? 'What needs you today, and where to pick up.' : 'Upload a resume and pick a tool to begin.'}
          chips={meta}
        />
        {isAuthenticated ? <DashboardToday /> : null}
        <section className="dash-section" aria-labelledby="dash-start">
          <div className="dash-section__head">
            <h2 className="dash-section__title" id="dash-start">Start</h2>
          </div>
          <DashboardResumeUpload />
        </section>
        <div className="dash-columns">
          <DashboardTools />
          {isAuthenticated ? (
            <div className="dash-stack" data-tour="activity">
              <RecentRuns />
              <FavoriteRuns />
            </div>
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
