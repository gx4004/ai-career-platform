import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import {
  Badge, Button, ConfirmDialog, EmptyState, ErrorState, List, MetaRow, Notice, RowMeta, Section, Select, Skeleton, Stack,
} from '#/components/kit'
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
import { FactRow } from '#/components/profile/FactRow'
import {
  EditDevelopmentItemDialog,
  type DevelopmentEditSubmit,
} from '#/components/profile/EditDevelopmentItemDialog'

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

  function openEditor(item: DevelopmentItem) {
    setEditError(null)
    setEditTarget(item)
  }

  return (
    <Section
      id="skills-to-build"
      title="Skills to build"
      description={items.length > 0 ? 'Gaps you chose to work on. Completing one adds it to your profile.' : undefined}
    >
      <Stack gap={6}>
        {actionError ? <Notice tone="danger" onDismiss={() => setActionError(null)}>{actionError}</Notice> : null}

        {itemsQuery.isPending ? (
          <List aria-label="Skills to build" aria-busy="true" className="profile-skeleton"><Skeleton variant="row" as="li" count={2} /></List>
        ) : itemsQuery.isError ? (
          <ErrorState
            title="Your skills to build couldn’t be loaded"
            onRetry={() => void itemsQuery.refetch()}
            retrying={itemsQuery.isFetching}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title="Nothing to build yet"
            description="When an application’s gap check finds something to work on, add it from the application and it shows up here."
            action={<Button asChild variant="secondary" size="sm"><Link to="/campaigns">Open applications</Link></Button>}
          />
        ) : (
          groups.map((group) => (
            <Section key={group.responseKind} headingLevel={3} size="sm" title={group.label} count={group.items.length} description={group.description}>
              <List aria-label={group.label}>
                {group.items.map((item) => {
                  const busy = pendingItemId === item.id || deleteTarget?.id === item.id
                  const kind = GAP_KIND_LABELS[item.gap_kind]
                  return (
                    <FactRow
                      key={item.id}
                      title={kind}
                      busy={busy}
                      editLabel={`Edit: ${kind}`}
                      onEdit={() => openEditor(item)}
                      reveal={(
                        <Button iconOnly size="sm" variant="ghost" disabled={busy} aria-label={`Delete: ${kind}`} onClick={() => setDeleteTarget(item)}>
                          <Trash2 aria-hidden="true" />
                        </Button>
                      )}
                      details={
                        <>
                          <div className="profile-line">{item.notes || 'No notes yet'}</div>
                          <MetaRow>
                            {formatTargetDate(item.target_date) ? `Target ${formatTargetDate(item.target_date)}` : 'No target date'}
                            {item.evidence_item_id ? <Badge tone="success" size="sm" role="status">Added to your profile</Badge> : null}
                          </MetaRow>
                        </>
                      }
                    >
                      <RowMeta>
                        <Select
                          size="sm"
                          className="profile-status"
                          aria-label="Status"
                          value={item.state}
                          disabled={busy}
                          onChange={(event) => handleStateChange(item, event.target.value as DevelopmentState)}
                        >
                          {STATE_ORDER.map((option) => (
                            <option key={option} value={option}>{STATE_LABELS[option]}</option>
                          ))}
                        </Select>
                      </RowMeta>
                    </FactRow>
                  )
                })}
              </List>
            </Section>
          ))
        )}
      </Stack>

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

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this skill to build?"
        description="This permanently removes it from your list. It takes effect immediately and cannot be undone."
        confirmLabel="Delete item"
        icon={<Trash2 />}
        pending={deleteMutation.isPending}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </Section>
  )
}
