import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Trash2 } from 'lucide-react'
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogForm,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  List,
  Notice,
  Page,
  PageHeader,
  Row,
  RowActions,
  RowBody,
  RowMeta,
  RowSubtitle,
  RowTitle,
  Section,
  useToast,
} from '#/components/kit'
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
  const { toast } = useToast()
  const { health, status, user } = useSession()
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
    <Page width="narrow">
      <PageHeader title="Settings" />

      <Section title="General">
        <List className="settings-list" aria-label="General">
          <Row>
            <RowBody>
              <RowTitle>Onboarding</RowTitle>
              <RowSubtitle>Replay the welcome tour.</RowSubtitle>
            </RowBody>
            <RowActions reveal={false}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onboarding.reset()
                  onboarding.startTour()
                }}
              >
                Replay tour
              </Button>
            </RowActions>
          </Row>
          <Row>
            <RowBody>
              <RowTitle>Local workspace data</RowTitle>
              <RowSubtitle>Clear cached drafts, guest demos and workflow context on this device.</RowSubtitle>
            </RowBody>
            <RowActions reveal={false}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  clearSensitiveBrowserData()
                  toast({ tone: 'success', title: 'Local drafts and demo state were cleared.' })
                }}
              >
                Clear local drafts
              </Button>
            </RowActions>
          </Row>
          <Row>
            <RowBody>
              <RowTitle>Saved workspace history</RowTitle>
              <RowSubtitle>Review, favorite, pin and delete saved runs in the timeline.</RowSubtitle>
            </RowBody>
            <RowActions reveal={false}>
              <Button asChild variant="secondary" size="sm">
                <Link to="/history">Open timeline</Link>
              </Button>
            </RowActions>
          </Row>
          <Row>
            <RowBody>
              <RowTitle>Connection</RowTitle>
            </RowBody>
            <RowMeta>
              <Badge tone={isOnline ? 'success' : 'danger'} dot>
                {isOnline ? 'Connected' : "Can't reach the server"}
              </Badge>
            </RowMeta>
          </Row>
        </List>
      </Section>

      {isAuthenticated ? (
        <Section title="Data and privacy">
          {exportError ? (
            <Notice tone="danger" onDismiss={() => setExportError(null)}>
              {exportError}
            </Notice>
          ) : null}
          <List className="settings-list" aria-label="Data and privacy">
            <Row>
              <RowBody>
                <RowTitle>Export career data</RowTitle>
                <RowSubtitle>Download everything you saved as a JSON file.</RowSubtitle>
              </RowBody>
              <RowActions reveal={false}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleCareerDataExport()}
                  loading={dataAction === 'export'}
                >
                  Export data
                </Button>
              </RowActions>
            </Row>
            <Row>
              <RowBody>
                <RowTitle>Delete evidence profile</RowTitle>
                <RowSubtitle>Erase saved Evidence Profile items without deleting your account.</RowSubtitle>
              </RowBody>
              <RowActions reveal={false}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setProfileDeleteError(null)
                    setProfileDeleteOpen(true)
                  }}
                >
                  Delete profile
                </Button>
              </RowActions>
            </Row>
            <Row>
              <RowBody>
                <RowTitle>Delete account</RowTitle>
                <RowSubtitle>
                  Permanently delete your account, saved runs and workspaces. This cannot be undone.
                </RowSubtitle>
              </RowBody>
              <RowActions reveal={false}>
                <Button variant="secondary" size="sm" onClick={() => setDeleteOpen(true)}>
                  Delete account
                </Button>
              </RowActions>
            </Row>
          </List>
        </Section>
      ) : null}

      <OnboardingDialog
        open={onboarding.open}
        onComplete={onboarding.complete}
        onSkip={onboarding.skip}
        onOpenChange={onboarding.setOpen}
      />

      <Dialog open={deleteOpen} onOpenChange={(open) => !deleteSubmitting && setDeleteOpen(open)}>
        <DialogContent size="md" showClose={false} dismissible={!deleteSubmitting}>
          <DialogForm
            onSubmit={(event) => {
              event.preventDefault()
              void handleDeleteAccount()
            }}
          >
            <DialogHeader>
              <DialogTitle>Delete your account?</DialogTitle>
              <DialogDescription>
                This permanently removes your account, every saved tool run, and every workspace.
                The action is irreversible — we do not retain a backup. To confirm, type your email
                address below.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <Field
                id="delete-confirm-input"
                label={
                  <span>
                    Type <strong>{expectedConfirmation}</strong> to confirm
                  </span>
                }
                error={deleteError}
              >
                <Input
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={deleteConfirmInput}
                  onChange={(event) => setDeleteConfirmInput(event.target.value)}
                  placeholder="your.email@example.com"
                  disabled={deleteSubmitting}
                />
              </Field>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={deleteSubmitting}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" variant="destructive" disabled={!deleteEnabled} loading={deleteSubmitting}>
                <Trash2 aria-hidden />
                {deleteSubmitting ? 'Deleting…' : 'Delete account permanently'}
              </Button>
            </DialogFooter>
          </DialogForm>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={profileDeleteOpen}
        onOpenChange={setProfileDeleteOpen}
        pending={dataAction === 'erase'}
        title="Delete your evidence profile?"
        description="This immediately removes every Evidence Profile item. It does not delete your account, and it cannot be undone."
        confirmLabel="Delete evidence profile"
        icon={<Trash2 aria-hidden />}
        onConfirm={() => void handleProfileErasure()}
      >
        {profileDeleteError ? <Notice tone="danger">{profileDeleteError}</Notice> : null}
      </ConfirmDialog>
    </Page>
  )
}
