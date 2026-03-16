import { useEffect } from 'react'
import { DashboardHero } from '#/components/dashboard/DashboardHero'
import { FavoriteRuns } from '#/components/dashboard/FavoriteRuns'
import { QuickStartGrid } from '#/components/dashboard/QuickStartGrid'
import { RecentRuns } from '#/components/dashboard/RecentRuns'
import { PageFrame } from '#/components/app/PageFrame'
import { OnboardingTour } from '#/components/onboarding/OnboardingTour'
import { useOnboarding } from '#/hooks/useOnboarding'

export function DashboardPage() {
  const onboarding = useOnboarding()

  useEffect(() => {
    if (onboarding.shouldShow) {
      onboarding.startTour()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PageFrame>
      <div className="content-max dashboard-layout dashboard-stack">
        <DashboardHero />
        <QuickStartGrid />
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
