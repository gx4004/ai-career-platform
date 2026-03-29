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
import { useBreakpoint } from '#/hooks/use-breakpoint'

export function DashboardPage() {
  const onboarding = useOnboarding()
  const { status } = useSession()
  const isAuthenticated = status === 'authenticated'
  const bp = useBreakpoint()
  const isMobile = bp === 'mobile'

  useEffect(() => {
    document.body.classList.add('page-tone-dashboard')

    return () => {
      document.body.classList.remove('page-tone-dashboard')
    }
  }, [])

  // No onboarding tour on mobile — UI should be self-explanatory
  useEffect(() => {
    if (!isMobile && onboarding.shouldShow) {
      onboarding.startTour()
    }
  }, [isMobile]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PageFrame className="dashboard-page-frame premium-corner-canvas">
      <div className="content-max dashboard-layout dashboard-stack">
        <DashboardHero />
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
