import { createFileRoute } from '@tanstack/react-router'
import { DashboardHero } from '#/components/dashboard/DashboardHero'
import { FavoriteRuns } from '#/components/dashboard/FavoriteRuns'
import { GuestPrompt } from '#/components/dashboard/GuestPrompt'
import { QuickStartGrid } from '#/components/dashboard/QuickStartGrid'
import { RecentRuns } from '#/components/dashboard/RecentRuns'
import { WorkflowPipeline } from '#/components/dashboard/WorkflowPipeline'
import { OnboardingDialog } from '#/components/onboarding/OnboardingDialog'
import { PageFrame } from '#/components/app/PageFrame'
import { useOnboarding } from '#/hooks/useOnboarding'
import { useSession } from '#/hooks/useSession'
import { useEffect } from 'react'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const { status } = useSession()
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
        {status !== 'authenticated' ? <GuestPrompt /> : null}
        <QuickStartGrid />
        <div className="dashboard-main-grid">
          <RecentRuns />
          <FavoriteRuns />
        </div>
        <WorkflowPipeline />
      </div>
      <OnboardingDialog
        open={onboarding.open}
        onComplete={onboarding.complete}
        onSkip={onboarding.skip}
        onOpenChange={onboarding.setOpen}
      />
    </PageFrame>
  )
}
