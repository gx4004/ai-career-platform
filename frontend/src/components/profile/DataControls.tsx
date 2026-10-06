import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, Trash2, UserX } from 'lucide-react'
import {
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
  Row,
  RowActions,
  RowBody,
  RowLeading,
  RowSubtitle,
  RowTitle,
  Stack,
  useToast,
} from '#/components/kit'
import { markAccountDeleted } from '#/components/profile/AccountDeletedToast'
import { useSession } from '#/hooks/useSession'
import { deleteAccount, deleteEvidenceProfile, exportCareerData } from '#/lib/api/client'
import { clearSensitiveBrowserData } from '#/lib/privacy/browserData'
import { EVIDENCE_QUERY_KEY } from '#/lib/profile/evidence'
import { invalidateEvidenceCaches } from '#/lib/query/evidenceCaches'

/** What deleting the account removes, mirroring the backend's erasure (`delete_all_user_data`). */
const ACCOUNT_ERASES = [
  'Your account and sign-in',
  'Every saved tool run and workspace',
  'Your CV documents and their versions',
  'Every fact on your profile, saved or suggested, and your skills to build',
  'Your applications with their documents, notes and tasks, and your application details',
] as const

/**
 * Downloads everything saved for this account as one JSON file. `run` resolves when the file has been handed to
 * the browser; a failure is kept in `error` for the caller to show next to the control that started it.
 */
export function useCareerDataExport() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setPending(true)
    setError(null)
    try {
      const payload = await exportCareerData()
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `career-workbench-data-${new Date().toISOString().slice(0, 10)}.json`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Career data export failed.')
    } finally {
      setPending(false)
    }
  }

  return { run, pending, error, clearError: () => setError(null) }
}

/**
 * The irreversible one: the destructive button stays disabled until the owner has typed their email, and the
 * server checks the same string again. Closing it always starts the next opening clean.
 */
function DeleteAccountDialog({
  open,
  onOpenChange,
  email,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  email: string
}) {
  const queryClient = useQueryClient()
  const [confirmation, setConfirmation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const enabled = !submitting && email.length > 0 && confirmation.trim().toLowerCase() === email.toLowerCase()

  useEffect(() => {
    if (!open) {
      setConfirmation('')
      setError(null)
    }
  }, [open])

  async function handleDelete() {
    if (!enabled) return
    setSubmitting(true)
    setError(null)
    try {
      // The trimmed input is what the gate validated; the server sees the same string.
      await deleteAccount(confirmation.trim())
      // The API clears the auth cookies on its 204. Wipe this tab's own state so it cannot think the owner is
      // still signed in, then leave for the landing page.
      clearSensitiveBrowserData()
      queryClient.clear()
      markAccountDeleted()
      window.location.assign('/')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Account deletion failed. Please try again or contact support.')
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent size="md" showClose={false} dismissible={!submitting}>
        <DialogForm
          onSubmit={(event) => {
            event.preventDefault()
            void handleDelete()
          }}
        >
          <DialogHeader data-tone="danger">
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This permanently removes everything below. It is irreversible — we do not retain a backup. To confirm,
              type your email address.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ul className="data-erases" aria-label="What is erased">
              {ACCOUNT_ERASES.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <Field
              id="delete-confirm-input"
              label={
                <span>
                  Type <strong>{email}</strong> to confirm
                </span>
              }
              error={error}
            >
              <Input
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="your.email@example.com"
                disabled={submitting}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={submitting}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={!enabled} loading={submitting}>
              <Trash2 aria-hidden />
              {submitting ? 'Deleting…' : 'Delete account permanently'}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The three data controls as rows: download everything, erase the Evidence Profile, delete the account.
 * Settings and Account both show this block, so the wording and the confirmations are the same wherever
 * the owner meets them. `detailed` spells out what each deletion removes under the row.
 */
export function DataControls({ listLabel, detailed = false }: { listLabel: string; detailed?: boolean }) {
  const queryClient = useQueryClient()
  const { user } = useSession()
  const { toast } = useToast()
  const exporter = useCareerDataExport()
  const [accountOpen, setAccountOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [erasing, setErasing] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  async function eraseProfile() {
    setErasing(true)
    setProfileError(null)
    try {
      await deleteEvidenceProfile()
      queryClient.removeQueries({ queryKey: EVIDENCE_QUERY_KEY })
      await invalidateEvidenceCaches(queryClient, { rankingMayChange: true })
      setProfileOpen(false)
      toast({
        tone: 'success',
        title: 'Evidence profile deleted',
        description: 'Your runs, CVs and applications are untouched.',
      })
    } catch (failure) {
      setProfileError(failure instanceof Error ? failure.message : 'Evidence profile deletion failed.')
    } finally {
      setErasing(false)
    }
  }

  return (
    <Stack gap={3}>
      {exporter.error ? (
        <Notice tone="danger" onDismiss={exporter.clearError}>
          {exporter.error}
        </Notice>
      ) : null}
      <List className="settings-list" aria-label={listLabel}>
        <Row>
          <RowLeading>
            <Download aria-hidden />
          </RowLeading>
          <RowBody>
            <RowTitle>Export career data</RowTitle>
            <RowSubtitle>
              Download everything you saved as a JSON file{detailed ? ': your profile, CV documents, runs and applications.' : '.'}
            </RowSubtitle>
          </RowBody>
          <RowActions reveal={false}>
            <Button variant="secondary" size="sm" onClick={() => void exporter.run()} loading={exporter.pending}>
              Export data
            </Button>
          </RowActions>
        </Row>
        <Row>
          <RowLeading>
            <Trash2 aria-hidden />
          </RowLeading>
          <RowBody>
            <RowTitle>Delete evidence profile</RowTitle>
            <RowSubtitle>
              Erase the facts saved on your profile without deleting your account
              {detailed ? '. Your runs, CVs and applications stay.' : '.'}
            </RowSubtitle>
          </RowBody>
          <RowActions reveal={false}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setProfileError(null)
                setProfileOpen(true)
              }}
            >
              Delete profile
            </Button>
          </RowActions>
        </Row>
        <Row>
          <RowLeading>
            <UserX aria-hidden />
          </RowLeading>
          <RowBody>
            <RowTitle>Delete account</RowTitle>
            <RowSubtitle>
              Permanently delete your account, saved runs and workspaces. This cannot be undone.
            </RowSubtitle>
          </RowBody>
          <RowActions reveal={false}>
            <Button variant="destructive" size="sm" onClick={() => setAccountOpen(true)}>
              Delete account
            </Button>
          </RowActions>
        </Row>
      </List>

      <DeleteAccountDialog open={accountOpen} onOpenChange={setAccountOpen} email={user?.email ?? ''} />

      <ConfirmDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        pending={erasing}
        title="Delete your evidence profile?"
        description="This immediately removes every fact on your profile, saved or suggested. It does not delete your account, and it cannot be undone."
        confirmLabel="Delete evidence profile"
        icon={<Trash2 aria-hidden />}
        onConfirm={() => void eraseProfile()}
      >
        {profileError ? <Notice tone="danger">{profileError}</Notice> : null}
      </ConfirmDialog>
    </Stack>
  )
}
