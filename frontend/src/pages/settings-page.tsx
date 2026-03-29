import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '#/components/ui/button'
import { PageFrame } from '#/components/app/PageFrame'
import { OnboardingDialog } from '#/components/onboarding/OnboardingDialog'
import { useOnboarding } from '#/hooks/useOnboarding'
import { useSession } from '#/hooks/useSession'
import { changeLanguage } from '#/lib/i18n'
import { clearTransientResults } from '#/lib/tools/demoRuns'
import { clearAllToolDrafts, clearWorkflowContext } from '#/lib/tools/drafts'

export function SettingsPage() {
  const onboarding = useOnboarding()
  const { health } = useSession()
  const [cleared, setCleared] = useState(false)
  const { t, i18n } = useTranslation()

  return (
    <PageFrame>
      <div className="content-max settings-layout">
        <header className="settings-header">
          <h1 className="settings-header-title">Settings</h1>
          <p className="settings-header-subtitle">
            Manage your local workspace, onboarding preferences, and system diagnostics.
          </p>
        </header>

        <section className="settings-section">
          <div className="settings-panel">
            <div className="settings-row">
              <div className="settings-info">
                <h2 className="settings-title">Onboarding</h2>
                <p className="settings-description">
                  Replay the welcome tour to revisit the platform introduction and tool overview.
                </p>
              </div>
              <div className="settings-action">
                <Button
                  variant="outline"
                  className="settings-btn"
                  onClick={() => {
                    onboarding.reset()
                    onboarding.startTour()
                  }}
                >
                  <RotateCcw size={14} className="mr-1.5" />
                  Replay tour
                </Button>
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-info">
                <h2 className="settings-title">Local workspace data</h2>
                <p className="settings-description">
                  Clear locally cached drafts, guest demos, and workflow context to restart the guided flow.
                  {cleared && " Local drafts and demo state were cleared."}
                </p>
              </div>
              <div className="settings-action">
                <Button
                  variant="outline"
                  className="settings-btn settings-btn--destructive"
                  onClick={() => {
                    clearAllToolDrafts()
                    clearWorkflowContext()
                    clearTransientResults()
                    setCleared(true)
                  }}
                >
                  Clear local drafts
                </Button>
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-info">
                <h2 className="settings-title">Saved workspace history</h2>
                <p className="settings-description">
                  Authenticated results live in the workspace timeline. Review, favorite, pin, and delete saved runs there.
                </p>
              </div>
              <div className="settings-action">
                <Button asChild variant="outline" className="settings-btn">
                  <Link to="/history">Open timeline</Link>
                </Button>
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-info">
                <h2 className="settings-title">{t('settings.language')}</h2>
                <p className="settings-description">
                  {t('settings.languageDescription')}
                </p>
              </div>
              <div className="settings-action">
                <select
                  className="settings-language-select"
                  value={i18n.language}
                  onChange={(e) => changeLanguage(e.target.value)}
                >
                  <option value="en">English</option>
                  <option value="tr">Türkçe</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-panel settings-status-panel">
            <div className="settings-status-header">
              <div className="settings-info">
                <h2 className="settings-title">System Diagnostics</h2>
                <p className="settings-description">
                  Quick check for API reachability from the frontend client.
                </p>
              </div>
            </div>
            
            <div className="settings-status-grid">
              <div className="settings-status-item">
                <span className="settings-status-label">API Status</span>
                <span className={`settings-status-value ${health?.status !== 'ok' ? 'is-offline' : ''}`}>
                  {health?.status === 'ok' ? 'Online & Healthy' : 'Unknown / Offline'}
                </span>
              </div>
              <div className="settings-status-item">
                <span className="settings-status-label">Service</span>
                <span className="settings-status-value">{health?.service || 'Backend API'}</span>
              </div>
              <div className="settings-status-item">
                <span className="settings-status-label">Environment</span>
                <span className="settings-status-value">{health?.environment || 'development'}</span>
              </div>
              <div className="settings-status-item" style={{ gridColumn: '1 / -1' }}>
                <span className="settings-status-label">Last Checked</span>
                <span className="settings-status-value">
                  {health?.time ? new Date(health.time).toLocaleString() : 'Unavailable'}
                </span>
              </div>
            </div>
          </div>
        </section>
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
