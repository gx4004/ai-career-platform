import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Sprout, Trash2 } from 'lucide-react'
import {
  Badge, Button, ConfirmDialog, EmptyState, ErrorState, List, MetaRow, Notice, RowMeta, Section, Select, Skeleton, Stack,
} from '#/components/kit'
import { listEvidenceItems } from '#/lib/api/client'
import type { EvidenceItem } from '#/lib/api/schemas'
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
import { DEVELOPMENT_PLAN_QUERY_KEY, EVIDENCE_QUERY_KEY, invalidateEvidenceCaches } from '#/lib/query/evidenceCaches'
import { FactRow } from '#/components/profile/FactRow'
import {
  EditDevelopmentItemDialog,
  type DevelopmentEditSubmit,
} from '#/components/profile/EditDevelopmentItemDialog'
import { CompleteSkillDialog, type CompletionResult } from '#/components/profile/CompleteSkillDialog'

/**
 * "Skills to build" — the R17 development plan on the profile page (#321).
 * Items are created from an application's gap checklist, so the empty state points
 * there.
 */
export function SkillsToBuildSection({
  onShowEvidence,
}: {
  /** Called with the profile item completing produced, so the page can scroll to it. */
  onShowEvidence?: (evidenceItemId: string) => void
} = {}) {
  const queryClient = useQueryClient()
  const [pendingItemId, setPendingItemId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<DevelopmentItem | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DevelopmentItem | null>(null)
  const [completeTarget, setCompleteTarget] = useState<DevelopmentItem | null>(null)
  const [completeError, setCompleteError] = useState<string | null>(null)
  const [completion, setCompletion] = useState<CompletionResult | null>(null)

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
    onSuccess: invalidate,
    onError: (error) => reportError(error, 'Could not update the status.'),
    onSettled: () => setPendingItemId(null),
  })

  // Completing an item can add a fact to the profile (R17 #201), so it goes through its own dialog.
  const completeMutation = useMutation({
    mutationFn: ({ item, notes }: { item: DevelopmentItem; notes: string }) =>
      // Words are sent only when they changed; an unchanged note stays the owner's own words on the server.
      updateDevelopmentItem(item.id, {
        state: 'completed',
        ...(notes !== (item.notes ?? '') ? { notes: notes || null } : {}),
      }),
    onSuccess: async (updated) => {
      setCompleteError(null)
      // The server decides: it saves a fact only from written words, so its answer says what happened.
      setCompletion({ evidenceItemId: updated.evidence_item_id })
      await invalidateEvidenceCaches(queryClient, { rankingMayChange: true })
    },
    onError: (error) =>
      setCompleteError(error instanceof Error ? error.message : 'Could not mark this complete.'),
  })

  function closeCompletion() {
    setCompleteTarget(null)
    setCompleteError(null)
    setCompletion(null)
  }

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
  // A completed item can link a fact on the profile, saved or waiting for review. The badge says which,
  // from the profile itself (the same query the page above uses), not from the link alone.
  const linksEvidence = items.some((item) => item.evidence_item_id)
  const evidenceQuery = useQuery({
    queryKey: EVIDENCE_QUERY_KEY,
    queryFn: async () => (await listEvidenceItems()).items,
    enabled: linksEvidence,
    // The profile page above already reads it; edits there invalidate it, so a fresh copy is not refetched here.
    staleTime: 30_000,
  })
  const evidenceById = useMemo(
    () => new Map((evidenceQuery.data ?? []).map((fact: EvidenceItem) => [fact.id, fact])),
    [evidenceQuery.data],
  )

  function handleStateChange(item: DevelopmentItem, state: DevelopmentState) {
    if (state === item.state) return
    if (state === 'completed') {
      setCompleteError(null)
      setCompletion(null)
      setCompleteTarget(item)
      return
    }
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
      description={items.length > 0 ? 'Gaps you chose to work on. Completing one with what you did adds it to your profile.' : undefined}
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
            icon={<Sprout />}
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
                  // What to build (the requirement the gap named); older items only know their kind.
                  const name = item.label?.trim() || kind
                  const fact = item.evidence_item_id ? evidenceById.get(item.evidence_item_id) : undefined
                  return (
                    <FactRow
                      key={item.id}
                      title={name}
                      busy={busy}
                      editLabel={`Edit: ${name}`}
                      onEdit={() => openEditor(item)}
                      reveal={(
                        <Button iconOnly size="sm" variant="ghost" disabled={busy} aria-label={`Delete: ${name}`} onClick={() => setDeleteTarget(item)}>
                          <Trash2 aria-hidden="true" />
                        </Button>
                      )}
                      details={
                        <>
                          <div className="profile-line">{item.notes || 'No notes yet'}</div>
                          <MetaRow>
                            {name !== kind ? kind : null}
                            {formatTargetDate(item.target_date) ? `Target ${formatTargetDate(item.target_date)}` : 'No target date'}
                            {item.application_id ? (
                              <Button asChild variant="link" size="sm">
                                <Link to="/campaigns/$campaignId" params={{ campaignId: item.application_id }} aria-label={`From an application: ${name}`}>
                                  From an application
                                </Link>
                              </Button>
                            ) : null}
                            {fact?.confirmation_state === 'confirmed' ? (
                              <Badge tone="success" size="sm" role="status">Added to your profile</Badge>
                            ) : fact ? (
                              <Badge tone="warning" size="sm" role="status">Waiting for your review</Badge>
                            ) : null}
                            {fact && onShowEvidence ? (
                              <Button
                                type="button"
                                variant="link"
                                size="sm"
                                aria-label={`Show on your profile: ${name}`}
                                onClick={() => onShowEvidence(item.evidence_item_id as string)}
                              >
                                Show it
                              </Button>
                            ) : null}
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

      <CompleteSkillDialog
        item={completeTarget}
        submitting={completeMutation.isPending}
        error={completeError}
        result={completion}
        onSubmit={(notes) => completeTarget && completeMutation.mutate({ item: completeTarget, notes })}
        onClose={closeCompletion}
        onShow={(evidenceItemId) => {
          closeCompletion()
          onShowEvidence?.(evidenceItemId)
        }}
      />

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
