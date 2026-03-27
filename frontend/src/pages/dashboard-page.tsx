import { useEffect } from 'react'
import { DashboardHero } from '#/components/dashboard/DashboardHero'
import { DashboardShowcaseGrid } from '#/components/dashboard/DashboardShowcaseGrid'
import { FavoriteRuns } from '#/components/dashboard/FavoriteRuns'
import { RecentRuns } from '#/components/dashboard/RecentRuns'
import { DashboardActivityFooter } from '#/components/dashboard/DashboardActivityFooter'
import { PageFrame } from '#/components/app/PageFrame'
import { OnboardingTour } from '#/components/onboarding/OnboardingTour'
import { useOnboarding } from '#/hooks/useOnboarding'
import { useSession } from '#/hooks/useSession'

export function DashboardPage() {
  const onboarding = useOnboarding()
  const { status } = useSession()
  const isAuthenticated = status === 'authenticated'

  useEffect(() => {
    document.body.classList.add('page-tone-dashboard')

    return () => {
      document.body.classList.remove('page-tone-dashboard')
    }
  }, [])

  useEffect(() => {
    if (onboarding.shouldShow) {
      onboarding.startTour()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PageFrame className="dashboard-page-frame premium-corner-canvas">
      <div className="content-max dashboard-layout dashboard-stack">
        <DashboardHero />
        <div className="dash-showcase-floating">
          <DashboardShowcaseGrid />
        </div>
        <div className="dashboard-light-surface">
          {isAuthenticated ? (
            <div className="dashboard-runs-grid" data-tour="activity">
              <RecentRuns />
              <FavoriteRuns />
            </div>
          ) : (
            <DashboardActivityFooter />
          )}
          <div className="dashboard-footer-strip" />
        </div>
      </div>
      <OnboardingTour
        open={onboarding.open}
        onComplete={onboarding.complete}
        onSkip={onboarding.skip}
      />
    </PageFrame>
  )
}
