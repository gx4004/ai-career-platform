import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Activity,
  AlertTriangle,
  Clock,
  Compass,
  Download,
  Globe,
  HardDrive,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { PageFrame } from '#/components/app/PageFrame'
import { OnboardingDialog } from '#/components/onboarding/OnboardingDialog'
import { useOnboarding } from '#/hooks/useOnboarding'
import { useSession } from '#/hooks/useSession'
import { deleteAccount, deleteEvidenceProfile, exportCareerData } from '#/lib/api/client'
import { changeLanguage } from '#/lib/i18n'
import { clearSensitiveBrowserData } from '#/lib/privacy/browserData'
import { SUBMISSION_AUTHORIZATIONS_QUERY_ROOT } from '#/lib/api/submissionAuthorizations'
import { QUEUE_QUERY_ROOT } from '#/lib/api/queueCache'
import { EVIDENCE_QUERY_KEY } from '#/lib/profile/evidence'

export function SettingsPage() {
  const queryClient = useQueryClient()
  const onboarding = useOnboarding()
  const { health, status, user } = useSession()
  const [cleared, setCleared] = useState(false)
  const { t, i18n } = useTranslation()
  const isOnline = health?.status === 'ok'

  // Account-deletion dialog state. The Privacy Policy promises a working
  // right-to-erasure path; the action is irreversible so the destructive
  // button is gated on the user typing their email exactly.
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('')
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [profileDeleteOpen, setProfileDeleteOpen] = useState(false)
  const [dataAction, setDataAction] = useState<'export' | 'erase' | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [profileDeleteError, setProfileDeleteError] = useState<string | null>(null)
  const isAuthenticated = status === 'authenticated' && user !== null
  const expectedConfirmation = user?.email ?? ''
  const deleteEnabled =
    !deleteSubmitting &&
    expectedConfirmation.length > 0 &&
    deleteConfirmInput.trim().toLowerCase() === expectedConfirmation.toLowerCase()

  // Auto-hide cleared message after 3 seconds
  useEffect(() => {
    if (!cleared) return
    const timer = setTimeout(() => setCleared(false), 3000)
    return () => clearTimeout(timer)
  }, [cleared])

  // Reset dialog state whenever it closes so the next open starts clean.
  useEffect(() => {
    if (!deleteOpen) {
      setDeleteConfirmInput('')
      setDeleteError(null)
    }
  }, [deleteOpen])

  async function handleDeleteAccount() {
    if (!deleteEnabled) return
    setDeleteSubmitting(true)
    setDeleteError(null)
    try {
      // The trimmed input is what the UI gate validated; send it to the
      // backend so the server-side check sees the same string.
      await deleteAccount(deleteConfirmInput.trim())
      // Backend clears auth cookies on its 204 response. Wipe local
      // sessionStorage state so a stale tab doesn't think the user is
      // still signed in, then exit to the landing page.
      clearSensitiveBrowserData()
      queryClient.removeQueries({
        queryKey: SUBMISSION_AUTHORIZATIONS_QUERY_ROOT,
      })
      queryClient.removeQueries({ queryKey: QUEUE_QUERY_ROOT })
      window.location.assign('/')
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : 'Account deletion failed. Please try again or contact support.',
      )
      setDeleteSubmitting(false)
    }
  }

  async function handleCareerDataExport() {
    setDataAction('export')
    setExportError(null)
    try {
      const payload = await exportCareerData()
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json;charset=utf-8',
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `career-workbench-data-${new Date().toISOString().slice(0, 10)}.json`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Career data export failed.')
    } finally {
      setDataAction(null)
    }
  }

  async function handleProfileErasure() {
    setDataAction('erase')
    setProfileDeleteError(null)
    try {
      await deleteEvidenceProfile()
      queryClient.removeQueries({ queryKey: EVIDENCE_QUERY_KEY })
      setProfileDeleteOpen(false)
    } catch (error) {
      setProfileDeleteError(
        error instanceof Error ? error.message : 'Evidence profile deletion failed.',
      )
    } finally {
      setDataAction(null)
    }
  }

  return (
    <PageFrame>
      <div className="content-max settings-layout">
        <header className="settings-header">
          <p className="settings-header-subtitle">
            Manage your local workspace, onboarding preferences, and system diagnostics.
          </p>
        </header>

        <section className="settings-section">
          <div className="settings-panel">
            <div className="settings-row">
              <div className="settings-row-icon">
                <Compass size={18} />
              </div>
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
              <div className="settings-row-icon">
                <HardDrive size={18} />
              </div>
              <div className="settings-info">
                <h2 className="settings-title">Local workspace data</h2>
                <p className="settings-description">
                  Clear locally cached drafts, guest demos, and workflow context to restart the guided flow.
                  {cleared && <span className="settings-cleared-msg"> Local drafts and demo state were cleared.</span>}
                </p>
              </div>
              <div className="settings-action">
                <Button
                  variant="outline"
                  className="settings-btn settings-btn--destructive"
                  onClick={() => {
                    clearSensitiveBrowserData()
                    setCleared(true)
                  }}
                >
                  Clear local drafts
                </Button>
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-row-icon">
                <Clock size={18} />
              </div>
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
              <div className="settings-row-icon">
                <Globe size={18} />
              </div>
              <div className="settings-info">
                <h2 className="settings-title">{t('settings.language')}</h2>
                <p className="settings-description">
                  {t('settings.languageDescription')}
                </p>
              </div>
              <div className="settings-action">
                <select
                  id="settings-language-select"
                  className="settings-language-select"
                  value={i18n.language}
                  onChange={(e) => changeLanguage(e.target.value)}
                  aria-label={t('settings.language')}
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
              <div className="settings-row-icon">
                <Activity size={18} />
              </div>
              <div className="settings-info">
                <div className="flex items-center gap-2.5">
                  <h2 className="settings-title">System Diagnostics</h2>
                  <span className={`settings-status-dot ${isOnline ? 'is-online' : 'is-offline'}`} />
                </div>
                <p className="settings-description">
                  {isOnline ? 'All systems operational — API is reachable.' : 'API connectivity could not be confirmed.'}
                </p>
              </div>
            </div>

            <div className="settings-status-grid">
              <div className="settings-status-item">
                <span className="settings-status-label">API Status</span>
                <span className={`settings-status-value ${!isOnline ? 'is-offline' : ''}`}>
                  {isOnline ? 'Online & Healthy' : 'Unknown / Offline'}
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

        {isAuthenticated && (
          <section className="settings-section">
            <div className="settings-panel">
              <div className="settings-row">
                <div className="settings-row-icon">
                  <Download size={18} />
                </div>
                <div className="settings-info">
                  <h2 className="settings-title">Export career data</h2>
                  <p className="settings-description">
                    Download all structured career data in a machine-readable JSON file.
                    This recovery control remains available while preview features are hidden.
                  </p>
                </div>
                <div className="settings-action">
                  <Button
                    variant="outline"
                    onClick={() => void handleCareerDataExport()}
                    loading={dataAction === 'export'}
                  >
                    <Download size={14} className="mr-1.5" />
                    Export data
                  </Button>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row-icon" style={{ color: 'var(--destructive)' }}>
                  <Trash2 size={18} />
                </div>
                <div className="settings-info">
                  <h2 className="settings-title">Delete evidence profile</h2>
                  <p className="settings-description">
                    Permanently erase saved Evidence Profile items without deleting your account.
                  </p>
                </div>
                <div className="settings-action">
                  <Button
                    variant="outline"
                    className="settings-btn settings-btn--destructive"
                    onClick={() => {
                      setProfileDeleteError(null)
                      setProfileDeleteOpen(true)
                    }}
                  >
                    Delete profile
                  </Button>
                </div>
              </div>
              {exportError ? <p role="alert" className="small-copy" style={{ color: 'var(--destructive)' }}>{exportError}</p> : null}
              <div className="settings-row">
                <div
                  className="settings-row-icon"
                  style={{ color: 'var(--destructive)' }}
                >
                  <AlertTriangle size={18} />
                </div>
                <div className="settings-info">
                  <h2 className="settings-title">Delete account</h2>
                  <p className="settings-description">
                    Permanently delete your account, every saved tool run, and every workspace.
                    This cannot be undone. We will not retain a backup.
                  </p>
                </div>
                <div className="settings-action">
                  <Button
                    variant="outline"
                    className="settings-btn settings-btn--destructive"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 size={14} className="mr-1.5" />
                    Delete account
                  </Button>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      <OnboardingDialog
        open={onboarding.open}
        onComplete={onboarding.complete}
        onSkip={onboarding.skip}
        onOpenChange={onboarding.setOpen}
      />

      <Dialog open={deleteOpen} onOpenChange={(open) => !deleteSubmitting && setDeleteOpen(open)}>
        <DialogContent showCloseButton={!deleteSubmitting}>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This permanently removes your account, every saved tool run, and every workspace.
              The action is irreversible — we do not retain a backup. To confirm, type your email
              address below.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="delete-confirm-input">
              Type <span className="font-mono text-foreground">{expectedConfirmation}</span> to confirm
            </Label>
            <Input
              id="delete-confirm-input"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={deleteConfirmInput}
              onChange={(event) => setDeleteConfirmInput(event.target.value)}
              placeholder="your.email@example.com"
              disabled={deleteSubmitting}
            />
          </div>
          {deleteError ? (
            <p
              role="alert"
              className="small-copy"
              style={{ color: 'var(--destructive)' }}
            >
              {deleteError}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              className="settings-btn--destructive"
              onClick={handleDeleteAccount}
              disabled={!deleteEnabled}
              loading={deleteSubmitting}
            >
              <Trash2 size={14} className="mr-1.5" />
              {deleteSubmitting ? 'Deleting…' : 'Delete account permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={profileDeleteOpen}
        onOpenChange={(open) => dataAction !== 'erase' && setProfileDeleteOpen(open)}
      >
        <DialogContent showCloseButton={dataAction !== 'erase'}>
          <DialogHeader>
            <DialogTitle>Delete your evidence profile?</DialogTitle>
            <DialogDescription>
              This immediately removes every Evidence Profile item. It does not delete your
              account, and it cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {profileDeleteError ? (
            <p role="alert" className="small-copy" style={{ color: 'var(--destructive)' }}>
              {profileDeleteError}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileDeleteOpen(false)} disabled={dataAction === 'erase'}>
              Cancel
            </Button>
            <Button
              variant="outline"
              className="settings-btn--destructive"
              onClick={() => void handleProfileErasure()}
              loading={dataAction === 'erase'}
            >
              Delete evidence profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  )
}
