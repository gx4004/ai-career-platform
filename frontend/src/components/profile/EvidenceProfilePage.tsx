import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileUp, ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Skeleton } from '#/components/ui/skeleton'
import { PageFrame } from '#/components/app/PageFrame'
import { AppStatePanel } from '#/components/app/AppStatePanel'
import { useSession } from '#/hooks/useSession'
import { useResumeCarry } from '#/hooks/use-resume-carry'
import {
  deleteEvidenceProfile,
  deleteEvidenceItem,
  listEvidenceItems,
  setEvidenceItemConfirmation,
  updateEvidenceItem,
} from '#/lib/api/client'
import type { EvidenceItem } from '#/lib/api/schemas'
import { EVIDENCE_QUERY_KEY, countByState, groupItemsByKind } from '#/lib/profile/evidence'
import { EvidenceItemCard } from '#/components/profile/EvidenceItemCard'
import {
  CorrectEvidenceDialog,
  type CorrectionSubmit,
} from '#/components/profile/CorrectEvidenceDialog'
import { ResumeImportDialog } from '#/components/profile/ResumeImportDialog'

export function EvidenceProfilePage() {
  const { status, openAuthDialog } = useSession()
  const queryClient = useQueryClient()
  const isAuthenticated = status === 'authenticated'
  const { hasResume, resumeText, filename } = useResumeCarry()

  const [importOpen, setImportOpen] = useState(false)
  const [pendingItemId, setPendingItemId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [correctTarget, setCorrectTarget] = useState<EvidenceItem | null>(null)
  const [correctError, setCorrectError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<EvidenceItem | null>(null)
  const [purgeOpen, setPurgeOpen] = useState(false)

  const itemsQuery = useQuery({
    queryKey: EVIDENCE_QUERY_KEY,
    queryFn: async () => (await listEvidenceItems()).items,
    enabled: isAuthenticated,
  })

  function reportError(error: unknown, fallback: string) {
    setActionError(error instanceof Error ? error.message : fallback)
    window.setTimeout(() => setActionError(null), 4000)
  }

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: EVIDENCE_QUERY_KEY })
  }

  const confirmationMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'confirm' | 'reject' }) =>
      setEvidenceItemConfirmation(id, action),
    onSuccess: invalidate,
    onError: (error) => reportError(error, 'Could not update the item.'),
    onSettled: () => setPendingItemId(null),
  })

  const correctionMutation = useMutation({
    mutationFn: async ({
      id,
      content,
      confirmEdit,
    }: {
      id: string
      content: Record<string, unknown>
      confirmEdit: boolean
    }) => {
      // The API always returns an edited item to `unconfirmed` (D-062). To keep
      // a confirmed edit confirmed, the user's explicit confirmation is a second,
      // separate call — never an automatic side effect of the edit.
      await updateEvidenceItem(id, { content })
      if (confirmEdit) {
        await setEvidenceItemConfirmation(id, 'confirm')
      }
    },
    onSuccess: async () => {
      setCorrectTarget(null)
      setCorrectError(null)
      await invalidate()
    },
    onError: (error) =>
      setCorrectError(error instanceof Error ? error.message : 'Could not save the correction.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteEvidenceItem(id),
    onSuccess: async () => {
      setDeleteTarget(null)
      await invalidate()
    },
    onError: (error) => {
      setDeleteTarget(null)
      reportError(error, 'Could not delete the item.')
    },
    onSettled: () => setPendingItemId(null),
  })

  const purgeMutation = useMutation({
    mutationFn: () => deleteEvidenceProfile(),
    onSuccess: async () => {
      setPurgeOpen(false)
      await invalidate()
    },
    onError: (error) => {
      setPurgeOpen(false)
      reportError(error, 'Could not delete the profile.')
    },
  })

  const items = itemsQuery.data ?? []
  const groups = useMemo(() => groupItemsByKind(items), [items])
  const counts = useMemo(() => countByState(items), [items])

  function handleConfirm(item: EvidenceItem) {
    setPendingItemId(item.id)
    confirmationMutation.mutate({ id: item.id, action: 'confirm' })
  }
  function handleReject(item: EvidenceItem) {
    setPendingItemId(item.id)
    confirmationMutation.mutate({ id: item.id, action: 'reject' })
  }
  function handleCorrectSubmit(payload: CorrectionSubmit) {
    if (!correctTarget) return
    correctionMutation.mutate({
      id: correctTarget.id,
      content: payload.content,
      confirmEdit: payload.confirmEdit,
    })
  }
  function handleDeleteConfirmed() {
    if (!deleteTarget) return
    setPendingItemId(deleteTarget.id)
    deleteMutation.mutate(deleteTarget.id)
  }

  if (!isAuthenticated) {
    return (
      <AppStatePanel
        title="Your evidence profile"
        description="Sign in to inspect the career evidence stored for your account, confirm what you stand behind, and remove anything you do not."
        scene="loginWorkflow"
        actions={[
          {
            label: 'Sign in',
            onClick: () => openAuthDialog({ to: '/profile', reason: 'account' }),
          },
          { label: 'Explore tools', to: '/resume', variant: 'outline' },
        ]}
      />
    )
  }

  return (
    <PageFrame>
      <section className="content-max evidence-layout">
        <header className="evidence-header">
          <div className="evidence-header__title">
            <div className="evidence-header__icon" aria-hidden="true">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h1 className="evidence-header__heading">Evidence profile</h1>
              <p className="evidence-header__subtitle">
                Every career fact stored for your account, grouped by kind. Confirm what you
                vouch for, correct mistakes, and reject or delete anything that does not belong.
              </p>
            </div>
          </div>
          {counts.total > 0 ? (
            <dl className="evidence-summary" aria-label="Trust state summary">
              <div className="evidence-summary__stat">
                <dt>Confirmed</dt>
                <dd>{counts.confirmed}</dd>
              </div>
              <div className="evidence-summary__stat">
                <dt>Unconfirmed</dt>
                <dd>{counts.unconfirmed}</dd>
              </div>
              <div className="evidence-summary__stat">
                <dt>Rejected</dt>
                <dd>{counts.rejected}</dd>
              </div>
            </dl>
          ) : null}
        </header>

        {hasResume && resumeText.length >= 50 ? (
          <section className="evidence-import-cta" aria-label="Import from resume">
            <div className="evidence-import-cta__icon" aria-hidden="true">
              <FileUp size={18} />
            </div>
            <div className="evidence-import-cta__body">
              <h2 className="evidence-import-cta__title">Import evidence from your resume</h2>
              <p className="muted-copy small-copy">
                Review suggestions extracted from{' '}
                {filename ? <strong>{filename}</strong> : 'your uploaded resume'}. Nothing is saved
                unless you accept it, and everything you accept arrives as unconfirmed.
              </p>
            </div>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              Review resume evidence
            </Button>
          </section>
        ) : null}

        {actionError ? (
          <p role="alert" className="evidence-banner evidence-banner--error">
            {actionError}
          </p>
        ) : null}

        {itemsQuery.isLoading ? (
          <div className="evidence-groups" aria-hidden="true">
            {[0, 1, 2].map((n) => (
              <Skeleton key={n} className="evidence-skeleton" />
            ))}
          </div>
        ) : itemsQuery.isError ? (
          <div className="evidence-empty">
            <p>We could not load your evidence profile.</p>
            <Button variant="outline" onClick={() => itemsQuery.refetch()}>
              Try again
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="evidence-empty">
            <h2 className="evidence-empty__title">No evidence yet</h2>
            <p className="muted-copy">
              Your profile fills up as you import a resume or promote a tool result into it.
              Anything added arrives as unconfirmed until you confirm it.
            </p>
          </div>
        ) : (
          <div className="evidence-groups">
            {groups.map((group) => (
              <section key={group.kind} className="evidence-group" aria-label={group.label}>
                <h2 className="evidence-group__title">
                  {group.label}
                  <span className="evidence-group__count">{group.items.length}</span>
                </h2>
                <ul className="evidence-group__list">
                  {group.items.map((item) => (
                    <EvidenceItemCard
                      key={item.id}
                      item={item}
                      busy={pendingItemId === item.id}
                      onConfirm={handleConfirm}
                      onReject={handleReject}
                      onCorrect={(target) => {
                        setCorrectError(null)
                        setCorrectTarget(target)
                      }}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {items.length > 0 ? (
          <section className="evidence-danger">
            <div>
              <h2 className="evidence-danger__title">Delete entire profile</h2>
              <p className="muted-copy small-copy">
                Permanently removes every evidence item above. This takes effect immediately and
                cannot be undone.
              </p>
            </div>
            <Button
              variant="outline"
              className="settings-btn--destructive"
              onClick={() => setPurgeOpen(true)}
            >
              <Trash2 size={14} className="mr-1.5" />
              Delete profile
            </Button>
          </section>
        ) : null}
      </section>

      {importOpen ? (
        <ResumeImportDialog
          open={importOpen}
          resumeText={resumeText}
          onOpenChange={setImportOpen}
          onImported={invalidate}
        />
      ) : null}

      <CorrectEvidenceDialog
        item={correctTarget}
        open={correctTarget !== null}
        submitting={correctionMutation.isPending}
        error={correctError}
        onOpenChange={(open) => {
          if (!open) {
            setCorrectTarget(null)
            setCorrectError(null)
          }
        }}
        onSubmit={handleCorrectSubmit}
      />

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !deleteMutation.isPending && !open && setDeleteTarget(null)}
      >
        <DialogContent showCloseButton={!deleteMutation.isPending}>
          <DialogHeader>
            <DialogTitle>Delete this item?</DialogTitle>
            <DialogDescription>
              This permanently removes the item from your evidence profile. It takes effect
              immediately and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              className="settings-btn--destructive"
              loading={deleteMutation.isPending}
              onClick={handleDeleteConfirmed}
            >
              <Trash2 size={14} className="mr-1.5" />
              Delete item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={purgeOpen}
        onOpenChange={(open) => !purgeMutation.isPending && setPurgeOpen(open)}
      >
        <DialogContent showCloseButton={!purgeMutation.isPending}>
          <DialogHeader>
            <DialogTitle>Delete your entire evidence profile?</DialogTitle>
            <DialogDescription>
              This permanently removes all {counts.total} evidence{' '}
              {counts.total === 1 ? 'item' : 'items'}. Erasure is immediate — we do not keep a
              backup — and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPurgeOpen(false)}
              disabled={purgeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              className="settings-btn--destructive"
              loading={purgeMutation.isPending}
              onClick={() => purgeMutation.mutate()}
            >
              <Trash2 size={14} className="mr-1.5" />
              Delete everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  )
}
