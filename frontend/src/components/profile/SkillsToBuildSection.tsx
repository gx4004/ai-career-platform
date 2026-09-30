import { useId, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, Pencil, Trash2 } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import { ConfirmDeleteDialog } from '#/components/app/ConfirmDeleteDialog'
import {
  deleteDevelopmentItem,
  getDevelopmentPlan,
  updateDevelopmentItem,
} from '#/lib/api/development'
import type { DevelopmentItem, DevelopmentState } from '#/lib/api/developmentSchemas'
import {
  GAP_KIND_LABELS,
  STATE_LABELS,
  STATE_ORDER,
  formatTargetDate,
  groupItemsByResponseKind,
} from '#/lib/development/plan'
import { DEVELOPMENT_PLAN_QUERY_KEY, invalidateEvidenceCaches } from '#/lib/query/evidenceCaches'
import { FactCard } from '#/components/profile/FactCard'
import {
  EditDevelopmentItemDialog,
  type DevelopmentEditSubmit,
} from '#/components/profile/EditDevelopmentItemDialog'

/** The status select is a skill's one primary control; Edit and Delete sit in its menu. */
function StatusSelect({
  item,
  busy,
  onChange,
}: {
  item: DevelopmentItem
  busy: boolean
  onChange: (state: DevelopmentState) => void
}) {
  const id = useId()
  return (
    <div className="fact-card__control">
      <label className="fact-card__control-label" htmlFor={id}>
        Status
      </label>
      <select
        id={id}
        className="fact-select"
        value={item.state}
        disabled={busy}
        onChange={(event) => onChange(event.target.value as DevelopmentState)}
      >
        {STATE_ORDER.map((option) => (
          <option key={option} value={option}>
            {STATE_LABELS[option]}
          </option>
        ))}
      </select>
    </div>
  )
}

/**
 * "Skills to build" — the R17 development plan on the profile page (#321).
 * Items are created from an application's gap checklist, so the empty state points
 * there.
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
    // Completing an item adds a fact or suggestion to the profile (R17 #201).
    onSuccess: (_item, { state }) =>
      state === 'completed'
        ? invalidateEvidenceCaches(queryClient, { rankingMayChange: true })
        : invalidate(),
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
    onSuccess: invalidate,
    onError: (error) => reportError(error, 'Could not delete the item.'),
    onSettled: () => setDeleteTarget(null),
  })

  const items = itemsQuery.data ?? []
  const groups = useMemo(() => groupItemsByResponseKind(items), [items])

  function handleStateChange(item: DevelopmentItem, state: DevelopmentState) {
    if (state === item.state) return
    setPendingItemId(item.id)
    stateMutation.mutate({ id: item.id, state })
  }

  return (
    <section id="skills-to-build" className="profile-section" aria-labelledby="skills-to-build-title">
      <div className="profile-section__head">
        <div>
          <h2 id="skills-to-build-title" className="profile-section__title">Skills to build</h2>
          <p className="profile-section__description">
            Gaps you chose to work on. Completing one adds it to your profile.
          </p>
        </div>
      </div>
      {actionError ? (
        <p role="alert" className="profile-banner profile-banner--error">
          {actionError}
        </p>
      ) : null}

      {itemsQuery.isLoading ? (
        <div className="fact-groups" aria-hidden="true">
          <Skeleton className="fact-skeleton" />
        </div>
      ) : itemsQuery.isError ? (
        <p className="profile-empty">
          We could not load your skills to build.{' '}
          <Button variant="outline" size="sm" onClick={() => itemsQuery.refetch()}>
            Try again
          </Button>
        </p>
      ) : items.length === 0 ? (
        <p className="profile-empty">
          <strong className="profile-empty__title">Nothing to build yet</strong> When an
          application&apos;s gap check finds something to work on, add it from the application and it
          shows up here.{' '}
          <Button variant="outline" size="sm" asChild>
            <Link to="/campaigns">Open applications</Link>
          </Button>
        </p>
      ) : (
        <div className="fact-groups">
          {groups.map((group) => (
            <section key={group.responseKind} className="fact-group" aria-label={group.label}>
              <h3 className="fact-group__title">
                {group.label}
                <span className="fact-group__count">{group.items.length}</span>
              </h3>
              <p className="fact-group__description">{group.description}</p>
              <ul className="fact-list">
                {group.items.map((item) => {
                  const busy = pendingItemId === item.id
                  return (
                    <FactCard
                      key={item.id}
                      tone={item.state}
                      busy={busy}
                      meta={
                        <>
                          {/* aria-live so a state change is announced once the badge updates. */}
                          <span aria-live="polite" className="inline-flex">
                            <Badge variant="outline" className={`fact-badge fact-badge--${item.state}`}>
                              {STATE_LABELS[item.state]}
                            </Badge>
                          </span>
                          <span className="fact-card__source">{GAP_KIND_LABELS[item.gap_kind]}</span>
                        </>
                      }
                      fields={[
                        {
                          key: 'target',
                          label: 'Target date',
                          value: formatTargetDate(item.target_date) ?? (
                            <span className="muted-copy">No target date</span>
                          ),
                        },
                        {
                          key: 'notes',
                          label: 'Notes',
                          value: item.notes || <span className="muted-copy">No notes yet</span>,
                        },
                      ]}
                      primary={
                        <StatusSelect
                          item={item}
                          busy={busy}
                          onChange={(state) => handleStateChange(item, state)}
                        />
                      }
                      menu={[
                        {
                          label: 'Edit',
                          icon: Pencil,
                          onSelect: () => {
                            setEditError(null)
                            setEditTarget(item)
                          },
                        },
                        {
                          label: 'Delete',
                          icon: Trash2,
                          destructive: true,
                          onSelect: () => setDeleteTarget(item),
                        },
                      ]}
                      menuLabel={`More actions: ${GAP_KIND_LABELS[item.gap_kind]}`}
                    >
                      {item.evidence_item_id ? (
                        <p className="fact-card__note" role="status">
                          <BadgeCheck size={15} aria-hidden="true" />
                          Added to your profile
                        </p>
                      ) : null}
                    </FactCard>
                  )
                })}
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
        onSubmit={(payload) => editTarget && editMutation.mutate({ id: editTarget.id, payload })}
      />

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        title="Delete this skill to build?"
        description="This permanently removes it from your list. It takes effect immediately and cannot be undone."
        confirmLabel="Delete item"
        pending={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </section>
  )
}
