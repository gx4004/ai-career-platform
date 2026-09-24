import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Sprout, Trash2 } from 'lucide-react'
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
import {
  confirmDevelopmentEvidence,
  declineDevelopmentEvidence,
  deleteDevelopmentItem,
  getDevelopmentPlan,
  updateDevelopmentItem,
} from '#/lib/api/development'
import type {
  DevelopmentItem,
  DevelopmentState,
} from '#/lib/api/developmentSchemas'
import { countByState, groupItemsByResponseKind } from '#/lib/development/plan'
import {
  DEVELOPMENT_PLAN_QUERY_KEY,
  invalidateEvidenceCaches,
} from '#/lib/query/evidenceCaches'
import { DevelopmentItemCard } from '#/components/profile/DevelopmentItemCard'
import {
  EditDevelopmentItemDialog,
  type DevelopmentEditSubmit,
} from '#/components/profile/EditDevelopmentItemDialog'

/**
 * "Skills to build" — the R17 development plan folded into the Evidence page
 * (Phase 1b, #321). Reuses the same items, mutations, and cards the standalone
 * Development Plan page used; only the page chrome (auth gate, PageFrame) is
 * gone, since this section renders inside the already-authenticated Evidence
 * Profile page.
 */
export function SkillsToBuildSection() {
  const queryClient = useQueryClient()

  const [pendingItemId, setPendingItemId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<DevelopmentItem | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DevelopmentItem | null>(null)

  const itemsQuery = useQuery({
    queryKey: DEVELOPMENT_PLAN_QUERY_KEY,
    queryFn: async () => (await getDevelopmentPlan()).items,
  })

  function reportError(error: unknown, fallback: string) {
    setActionError(error instanceof Error ? error.message : fallback)
    window.setTimeout(() => setActionError(null), 4000)
  }

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: DEVELOPMENT_PLAN_QUERY_KEY })
  }

  const stateMutation = useMutation({
    mutationFn: ({ id, state }: { id: string; state: DevelopmentState }) =>
      updateDevelopmentItem(id, { state }),
    onSuccess: invalidate,
    onError: (error) => reportError(error, 'Could not update the status.'),
    onSettled: () => setPendingItemId(null),
  })

  const editMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: DevelopmentEditSubmit }) =>
      updateDevelopmentItem(id, payload),
    onSuccess: async () => {
      setEditTarget(null)
      setEditError(null)
      await invalidate()
    },
    onError: (error) =>
      setEditError(error instanceof Error ? error.message : 'Could not save your changes.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDevelopmentItem(id),
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

  const evidenceMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'confirm' | 'decline' }) =>
      action === 'confirm'
        ? confirmDevelopmentEvidence(id)
        : declineDevelopmentEvidence(id),
    onSuccess: async (_item, { action }) => {
      await invalidateEvidenceCaches(queryClient, {
        rankingMayChange: action === 'confirm',
      })
    },
    onError: (error) => reportError(error, 'Could not update the evidence proposal.'),
    onSettled: () => setPendingItemId(null),
  })

  const items = itemsQuery.data ?? []
  const groups = useMemo(() => groupItemsByResponseKind(items), [items])
  const counts = useMemo(() => countByState(items), [items])

  function handleStateChange(item: DevelopmentItem, state: DevelopmentState) {
    if (state === item.state) return
    setPendingItemId(item.id)
    stateMutation.mutate({ id: item.id, state })
  }
  function handleEditSubmit(payload: DevelopmentEditSubmit) {
    if (!editTarget) return
    editMutation.mutate({ id: editTarget.id, payload })
  }
  function handleDeleteConfirmed() {
    if (!deleteTarget) return
    setPendingItemId(deleteTarget.id)
    deleteMutation.mutate(deleteTarget.id)
  }
  function handleEvidenceAction(item: DevelopmentItem, action: 'confirm' | 'decline') {
    setPendingItemId(item.id)
    evidenceMutation.mutate({ id: item.id, action })
  }

  if (!itemsQuery.isLoading && !itemsQuery.isError && items.length === 0) {
    // Nothing to plan yet — keep the fold quiet rather than showing an empty
    // section every time someone with no classified gaps opens their profile.
    return null
  }

  return (
    <section
      id="skills-to-build"
      className="content-max development-layout"
      aria-label="Skills to build"
    >
      <header className="development-header">
        <div className="development-header__title">
          <div className="development-header__icon" aria-hidden="true">
            <Sprout size={20} />
          </div>
          <div>
            <h2 className="development-header__heading">Skills to build</h2>
            <p className="development-header__subtitle">
              A bounded to-do list built from your classified gaps. Move each item through
              planned, in progress, and completed, and record an optional target date and notes.
            </p>
          </div>
        </div>
        {counts.total > 0 ? (
          <dl className="development-summary" aria-label="Progress summary">
            <div className="development-summary__stat">
              <dt>Planned</dt>
              <dd>{counts.planned}</dd>
            </div>
            <div className="development-summary__stat">
              <dt>In progress</dt>
              <dd>{counts.in_progress}</dd>
            </div>
            <div className="development-summary__stat">
              <dt>Completed</dt>
              <dd>{counts.completed}</dd>
            </div>
          </dl>
        ) : null}
      </header>

      {actionError ? (
        <p role="alert" className="development-banner development-banner--error">
          {actionError}
        </p>
      ) : null}

      {itemsQuery.isLoading ? (
        <div className="development-groups" aria-hidden="true">
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} className="development-skeleton" />
          ))}
        </div>
      ) : itemsQuery.isError ? (
        <div className="development-empty">
          <p>We could not load your skills to build.</p>
          <Button variant="outline" onClick={() => itemsQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="development-groups">
          {groups.map((group) => (
            <section
              key={group.responseKind}
              className="development-group"
              aria-label={group.label}
            >
              <h3 className="development-group__title">
                {group.label}
                <span className="development-group__count">{group.items.length}</span>
              </h3>
              <p className="development-group__description muted-copy small-copy">
                {group.description}
              </p>
              <ul className="development-group__list">
                {group.items.map((item) => (
                  <DevelopmentItemCard
                    key={item.id}
                    item={item}
                    busy={pendingItemId === item.id}
                    onStateChange={handleStateChange}
                    onEdit={(target) => {
                      setEditError(null)
                      setEditTarget(target)
                    }}
                    onDelete={setDeleteTarget}
                    onConfirmEvidence={(target) => handleEvidenceAction(target, 'confirm')}
                    onDeclineEvidence={(target) => handleEvidenceAction(target, 'decline')}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <EditDevelopmentItemDialog
        item={editTarget}
        open={editTarget !== null}
        submitting={editMutation.isPending}
        error={editError}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(null)
            setEditError(null)
          }
        }}
        onSubmit={handleEditSubmit}
      />

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !deleteMutation.isPending && !open && setDeleteTarget(null)}
      >
        <DialogContent showCloseButton={!deleteMutation.isPending}>
          <DialogHeader>
            <DialogTitle>Delete this item?</DialogTitle>
            <DialogDescription>
              This permanently removes the item from your skills to build. It takes effect
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
    </section>
  )
}
