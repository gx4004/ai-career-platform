import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { RotateCcw } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { PageFrame } from '#/components/app/PageFrame'
import { OnboardingDialog } from '#/components/onboarding/OnboardingDialog'
import { useOnboarding } from '#/hooks/useOnboarding'
import { useSession } from '#/hooks/useSession'
import { clearDemoRuns } from '#/lib/tools/demoRuns'
import { clearAllToolDrafts, clearWorkflowContext } from '#/lib/tools/drafts'

export function SettingsPage() {
  const onboarding = useOnboarding()
  const { health } = useSession()
  const [cleared, setCleared] = useState(false)

  return (
    <PageFrame>
      <section className="content-max app-grid">
        <div className="section-card p-6">
          <div className="grid gap-4">
            <div>
              <p className="eyebrow mb-2">Preferences</p>
              <h1 className="page-title">Settings</h1>
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
            <h2 className="section-title">Local workspace data</h2>
            <p className="muted-copy">
              Clear locally cached drafts, guest demos, and workflow context if you want to restart the guided flow on this device.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                clearAllToolDrafts()
                clearWorkflowContext()
                clearDemoRuns()
                setCleared(true)
              }}
            >
              Clear local drafts and demos
            </Button>
            {cleared ? (
              <p className="small-copy muted-copy">
                Local drafts and demo state were cleared. Saved workspace history is still available from your account.
              </p>
            ) : null}
          </div>
        </div>
        <div className="section-card p-6">
          <div className="grid gap-3">
            <h2 className="section-title">Saved workspace history</h2>
            <p className="muted-copy">
              Authenticated results live in the workspace timeline. Review, favorite, pin, and delete saved runs there instead of from local device settings.
            </p>
            <Button asChild variant="outline">
              <Link to="/history">Open workspace timeline</Link>
            </Button>
          </div>
        </div>
        <div className="section-card p-6">
          <div className="grid gap-3">
            <div className="flex items-center gap-2">
              <h2 className="section-title">System status</h2>
              <Badge variant="outline">
                {health?.status === 'ok' ? 'Healthy' : 'Unknown'}
              </Badge>
            </div>
            <p className="muted-copy">
              Use this quick check before demos or manual QA to confirm the API is reachable from the frontend.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="practice-card">
                <p className="eyebrow mb-2">Service</p>
                <p>{health?.service || 'Backend API'}</p>
              </div>
              <div className="practice-card">
                <p className="eyebrow mb-2">Environment</p>
                <p>{health?.environment || 'development'}</p>
              </div>
              <div className="practice-card">
                <p className="eyebrow mb-2">Last health time</p>
                <p>{health?.time ? new Date(health.time).toLocaleString() : 'Unavailable'}</p>
              </div>
            </div>
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
