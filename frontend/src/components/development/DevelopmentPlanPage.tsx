import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ListChecks, Trash2 } from 'lucide-react'
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
import {
  deleteDevelopmentItem,
  getDevelopmentPlan,
  updateDevelopmentItem,
} from '#/lib/api/development'
import type {
  DevelopmentItem,
  DevelopmentState,
} from '#/lib/api/developmentSchemas'
import { countByState, groupItemsByResponseKind } from '#/lib/development/plan'
import { DevelopmentItemCard } from '#/components/development/DevelopmentItemCard'
import {
  EditDevelopmentItemDialog,
  type DevelopmentEditSubmit,
} from '#/components/development/EditDevelopmentItemDialog'

const DEVELOPMENT_QUERY_KEY = ['development-plan', 'items'] as const

export function DevelopmentPlanPage() {
  const { status, openAuthDialog } = useSession()
  const queryClient = useQueryClient()
  const isAuthenticated = status === 'authenticated'

  const [pendingItemId, setPendingItemId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<DevelopmentItem | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DevelopmentItem | null>(null)

  const itemsQuery = useQuery({
    queryKey: DEVELOPMENT_QUERY_KEY,
    queryFn: async () => (await getDevelopmentPlan()).items,
    enabled: isAuthenticated,
  })

  function reportError(error: unknown, fallback: string) {
    setActionError(error instanceof Error ? error.message : fallback)
    window.setTimeout(() => setActionError(null), 4000)
  }

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: DEVELOPMENT_QUERY_KEY })
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

  if (!isAuthenticated) {
    return (
      <AppStatePanel
        title="Your development plan"
        description="Sign in to see the development items derived from your classified gaps, track their progress, and note how you plan to close each one."
        scene="loginWorkflow"
        actions={[
          {
            label: 'Sign in',
            onClick: () => openAuthDialog({ to: '/development-plan', reason: 'account' }),
          },
          { label: 'Explore tools', to: '/resume', variant: 'outline' },
        ]}
      />
    )
  }

  return (
    <PageFrame>
      <section className="content-max development-layout">
        <header className="development-header">
          <div className="development-header__title">
            <div className="development-header__icon" aria-hidden="true">
              <ListChecks size={20} />
            </div>
            <div>
              <h1 className="development-header__heading">Development plan</h1>
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
            <p>We could not load your development plan.</p>
            <Button variant="outline" onClick={() => itemsQuery.refetch()}>
              Try again
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="development-empty">
            <h2 className="development-empty__title">No development items yet</h2>
            <p className="muted-copy">
              Development items are created from the gaps a reviewer classifies in your work. Once a
              gap is classified, its honest next step appears here for you to plan, track, and
              complete.
            </p>
          </div>
        ) : (
          <div className="development-groups">
            {groups.map((group) => (
              <section
                key={group.responseKind}
                className="development-group"
                aria-label={group.label}
              >
                <h2 className="development-group__title">
                  {group.label}
                  <span className="development-group__count">{group.items.length}</span>
                </h2>
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
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>

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
              This permanently removes the item from your development plan. It takes effect
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
    </PageFrame>
  )
}
