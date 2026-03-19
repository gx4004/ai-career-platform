import { useEffect } from 'react'
import { DashboardHero } from '#/components/dashboard/DashboardHero'
import { DashboardShowcaseGrid } from '#/components/dashboard/DashboardShowcaseGrid'
import { FavoriteRuns } from '#/components/dashboard/FavoriteRuns'
import { RecentRuns } from '#/components/dashboard/RecentRuns'
import { PageFrame } from '#/components/app/PageFrame'
import { OnboardingTour } from '#/components/onboarding/OnboardingTour'
import { useOnboarding } from '#/hooks/useOnboarding'

export function DashboardPage() {
  const onboarding = useOnboarding()

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
        <section className="dash-showcase-section">
          <h2 className="dash-showcase-heading section-title">All tools</h2>
          <DashboardShowcaseGrid />
        </section>
        <div className="dashboard-runs-grid" data-tour="activity">
          <RecentRuns />
          <FavoriteRuns />
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
