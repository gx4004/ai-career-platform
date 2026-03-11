import { createFileRoute } from '@tanstack/react-router'
import { RotateCcw } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { PageFrame } from '#/components/app/PageFrame'
import { OnboardingDialog } from '#/components/onboarding/OnboardingDialog'
import { useOnboarding } from '#/hooks/useOnboarding'
import { useTheme } from '#/hooks/useTheme'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  const { mode, setMode } = useTheme()
  const onboarding = useOnboarding()

  return (
    <PageFrame>
      <section className="content-max app-grid">
        <div className="section-card p-6">
          <div className="grid gap-4">
            <div>
              <p className="eyebrow mb-2">Preferences</p>
              <h1 className="page-title">Settings</h1>
            </div>
            <div className="flex flex-wrap gap-3">
              {(['dark', 'light', 'system'] as const).map((option) => (
                <Button
                  key={option}
                  variant={mode === option ? 'default' : 'outline'}
                  onClick={() => setMode(option)}
                >
                  {option}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <div className="section-card p-6">
          <div className="grid gap-3">
            <h2 className="section-title">Onboarding</h2>
            <p className="muted-copy">
              Replay the welcome tour to revisit the platform introduction and tool overview.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                onboarding.reset()
                onboarding.startTour()
              }}
            >
              <RotateCcw size={16} />
              Replay tour
            </Button>
          </div>
        </div>
        <div className="section-card p-6">
          <div className="grid gap-3">
            <div className="flex items-center gap-2">
              <h2 className="section-title">Notifications</h2>
              <Badge variant="outline">Coming soon</Badge>
            </div>
            <p className="muted-copy">
              Email notification preferences will be available in a future update.
            </p>
            <Button variant="outline" disabled>
              Email updates
            </Button>
          </div>
        </div>
        <div className="section-card p-6">
          <div className="grid gap-3">
            <div className="flex items-center gap-2">
              <h2 className="section-title">Data</h2>
              <Badge variant="outline">Coming soon</Badge>
            </div>
            <p className="muted-copy">
              Bulk history clearing will be available in a future update.
            </p>
            <Button variant="outline" disabled>
              Clear all history
            </Button>
          </div>
        </div>
      </section>
      <OnboardingDialog
        open={onboarding.open}
        onComplete={onboarding.complete}
        onSkip={onboarding.skip}
        onOpenChange={onboarding.setOpen}
      />
    </PageFrame>
  )
}
