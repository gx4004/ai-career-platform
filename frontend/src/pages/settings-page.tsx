import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Trash2 } from 'lucide-react'
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
import { PageHero } from '#/components/app/PageHero'
import { WorkspacePage } from '#/components/app/WorkspacePage'
import { OnboardingDialog } from '#/components/onboarding/OnboardingDialog'
import { useOnboarding } from '#/hooks/useOnboarding'
import { useSession } from '#/hooks/useSession'
import { deleteAccount, deleteEvidenceProfile, exportCareerData } from '#/lib/api/client'
import { clearSensitiveBrowserData } from '#/lib/privacy/browserData'
import { EVIDENCE_QUERY_KEY } from '#/lib/profile/evidence'
import { invalidateEvidenceCaches } from '#/lib/query/evidenceCaches'

export function SettingsPage() {
  const queryClient = useQueryClient()
  const onboarding = useOnboarding()
  const { health, status, user } = useSession()
  const [cleared, setCleared] = useState(false)
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
      queryClient.clear()
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
      await invalidateEvidenceCaches(queryClient, { rankingMayChange: true })
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
    <WorkspacePage className="settings-page">
      <PageHero title="Settings" />
      <div className="settings-layout">
        <section className="settings-section">
          <h2 className="settings-section-heading">General</h2>
          <div className="settings-group">
            <div className="settings-row">
              <div className="settings-info">
                <h3 className="settings-title">Onboarding</h3>
                <p className="settings-description">
                  Replay the welcome tour.
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
                  Replay tour
                </Button>
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-info">
                <h3 className="settings-title">Local workspace data</h3>
                <p className="settings-description">
                  Clear cached drafts, guest demos and workflow context on this device.
                </p>
                <p role="status" className="settings-cleared-msg">
                  {cleared ? 'Local drafts and demo state were cleared.' : ''}
                </p>
              </div>
              <div className="settings-action">
                <Button
                  variant="outline"
                  className="settings-btn"
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
              <div className="settings-info">
                <h3 className="settings-title">Saved workspace history</h3>
                <p className="settings-description">
                  Review, favorite, pin and delete saved runs in the timeline.
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
                <h3 className="settings-title">Connection</h3>
              </div>
              <div className="settings-action">
                <span className="settings-status">
                  <span
                    className={`settings-status-dot ${isOnline ? 'is-online' : 'is-offline'}`}
                    aria-hidden="true"
                  />
                  {isOnline ? 'Connected' : "Can't reach the server"}
                </span>
              </div>
            </div>
          </div>
        </section>

        {isAuthenticated && (
          <section className="settings-section">
            <h2 className="settings-section-heading">Data and privacy</h2>
            <div className="settings-group">
              <div className="settings-row">
                <div className="settings-info">
                  <h3 className="settings-title">Export career data</h3>
                  <p className="settings-description">
                    Download everything you saved as a JSON file.
                  </p>
                  {exportError ? (
                    <p role="alert" className="settings-error">{exportError}</p>
                  ) : null}
                </div>
                <div className="settings-action">
                  <Button
                    variant="outline"
                    className="settings-btn"
                    onClick={() => void handleCareerDataExport()}
                    loading={dataAction === 'export'}
                  >
                    Export data
                  </Button>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-info">
                  <h3 className="settings-title">Delete evidence profile</h3>
                  <p className="settings-description">
                    Erase saved Evidence Profile items without deleting your account.
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
              <div className="settings-row">
                <div className="settings-info">
                  <h3 className="settings-title">Delete account</h3>
                  <p className="settings-description">
                    Permanently delete your account, saved runs and workspaces. This cannot be undone.
                  </p>
                </div>
                <div className="settings-action">
                  <Button
                    variant="outline"
                    className="settings-btn settings-btn--destructive"
                    onClick={() => setDeleteOpen(true)}
                  >
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
            <p role="alert" className="small-copy settings-error">
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
            <p role="alert" className="small-copy settings-error">
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
    </WorkspacePage>
  )
}
