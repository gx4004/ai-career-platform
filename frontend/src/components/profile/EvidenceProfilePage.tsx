import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, Check, FileUp, Trash2, X } from 'lucide-react'
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
import { AppStatePanel } from '#/components/app/AppStatePanel'
import {
  WorkspaceEmpty,
  WorkspaceHero,
  WorkspacePage,
  WorkspacePanel,
} from '#/components/app/WorkspacePage'
import { useSession } from '#/hooks/useSession'
import { useResumeCarry } from '#/hooks/use-resume-carry'
import {
  confirmImportedEvidenceItems,
  deleteEvidenceProfile,
  deleteEvidenceItem,
  listEvidenceItems,
  setEvidenceItemConfirmation,
  updateEvidenceItem,
} from '#/lib/api/client'
import { getDevelopmentPlan } from '#/lib/api/development'
import type { EvidenceItem } from '#/lib/api/schemas'
import { contentEntries, countByState, groupItemsByKind } from '#/lib/profile/evidence'
import {
  DEVELOPMENT_PLAN_QUERY_KEY,
  EVIDENCE_QUERY_KEY,
  invalidateEvidenceCaches,
} from '#/lib/query/evidenceCaches'
import { EvidenceItemCard } from '#/components/profile/EvidenceItemCard'
import {
  CorrectEvidenceDialog,
  type CorrectionSubmit,
} from '#/components/profile/CorrectEvidenceDialog'
import { ResumeImportDialog } from '#/components/profile/ResumeImportDialog'
import { SkillsToBuildSection } from '#/components/profile/SkillsToBuildSection'
import { isR17DevelopmentLoopEnabled } from '#/lib/flags/featureFlags'

/** A short one-line preview of what a suggested item says, for the review list. */
function previewText(item: EvidenceItem): string {
  const entries = contentEntries(item.content)
  return entries.find((entry) => entry.value)?.value || 'No details recorded'
}

function SuggestionRow({
  item,
  busy,
  onAccept,
  onReject,
}: {
  item: EvidenceItem
  busy: boolean
  onAccept: (item: EvidenceItem) => void
  onReject: (item: EvidenceItem) => void
}) {
  return (
    <li className="evidence-suggestion">
      <div className="evidence-suggestion__body">
        <span className="evidence-suggestion__kind">{item.kind}</span>
        <p className="evidence-suggestion__text">{previewText(item)}</p>
      </div>
      <div className="evidence-suggestion__actions">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => onAccept(item)}
          aria-label={`Accept: ${previewText(item)}`}
        >
          <Check size={14} />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => onReject(item)}
          aria-label={`Reject: ${previewText(item)}`}
        >
          <X size={14} />
        </Button>
      </div>
    </li>
  )
}

export function EvidenceProfilePage() {
  const { status, openAuthDialog } = useSession()
  const queryClient = useQueryClient()
  const isAuthenticated = status === 'authenticated'
  const { hasResume, resumeText } = useResumeCarry()
  const developmentLoopEnabled = isR17DevelopmentLoopEnabled()

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

  // Shares its cache with SkillsToBuildSection's own query below (same query
  // key), so this only costs a stat on the hero — not a second network call.
  const developmentItemsQuery = useQuery({
    queryKey: DEVELOPMENT_PLAN_QUERY_KEY,
    queryFn: async () => (await getDevelopmentPlan()).items,
    enabled: isAuthenticated && developmentLoopEnabled,
  })

  function reportError(error: unknown, fallback: string) {
    setActionError(error instanceof Error ? error.message : fallback)
    window.setTimeout(() => setActionError(null), 4000)
  }

  async function invalidateEvidenceOnly() {
    await queryClient.invalidateQueries({ queryKey: EVIDENCE_QUERY_KEY })
  }

  async function invalidateProfileMutation() {
    await invalidateEvidenceCaches(queryClient, { rankingMayChange: true })
  }

  const confirmationMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'confirm' | 'reject' }) =>
      setEvidenceItemConfirmation(id, action),
    onSuccess: invalidateProfileMutation,
    onError: (error) => reportError(error, 'Could not update the item.'),
    onSettled: () => setPendingItemId(null),
  })

  const acceptAllMutation = useMutation({
    mutationFn: () => confirmImportedEvidenceItems(),
    onSuccess: invalidateProfileMutation,
    onError: (error) => reportError(error, 'Could not accept all suggested items.'),
  })

  const correctionMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: Record<string, unknown> }) => {
      // Saving a correction is the owner typing it themselves right now, so the
      // API marks it Saved directly (Phase 1b, #321) — no extra confirm click.
      await updateEvidenceItem(id, { content })
    },
    onSuccess: () => {
      setCorrectTarget(null)
      setCorrectError(null)
    },
    onError: (error) =>
      setCorrectError(error instanceof Error ? error.message : 'Could not save the correction.'),
    onSettled: invalidateProfileMutation,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteEvidenceItem(id),
    onSuccess: async () => {
      setDeleteTarget(null)
      await invalidateProfileMutation()
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
      await invalidateProfileMutation()
    },
    onError: (error) => {
      setPurgeOpen(false)
      reportError(error, 'Could not delete the profile.')
    },
  })

  const items = itemsQuery.data ?? []
  const groups = useMemo(() => groupItemsByKind(items), [items])
  const counts = useMemo(() => countByState(items), [items])
  const suggestions = useMemo(
    () => items.filter((item) => item.confirmation_state === 'unconfirmed'),
    [items],
  )
  const importedUnconfirmedCount = useMemo(
    () => items.filter((item) => item.provenance === 'imported' && item.confirmation_state === 'unconfirmed').length,
    [items],
  )

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
    correctionMutation.mutate({ id: correctTarget.id, content: payload.content })
  }
  function handleDeleteConfirmed() {
    if (!deleteTarget) return
    setPendingItemId(deleteTarget.id)
    deleteMutation.mutate(deleteTarget.id)
  }

  if (!isAuthenticated) {
    return (
      <AppStatePanel
        title="Your profile"
        description="Sign in to see the facts about your experience that CV Studio and the tools reuse — confirm what you stand behind, and remove anything you do not."
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
    <WorkspacePage className="evidence-page">
      <WorkspaceHero
        icon={BadgeCheck}
        eyebrow="Your workspace"
        title="Your profile"
        subtitle="Facts about your experience that CV Studio and the tools reuse."
        stats={[
          { label: 'Saved facts', value: counts.confirmed },
          { label: 'Suggestions to review', value: counts.unconfirmed },
          ...(developmentLoopEnabled
            ? [{ label: 'Skills to build', value: developmentItemsQuery.data?.length ?? 0 }]
            : []),
        ]}
        actions={
          <Button onClick={() => (hasResume && resumeText.length >= 50 ? setImportOpen(true) : undefined)} asChild={!(hasResume && resumeText.length >= 50)}>
            {hasResume && resumeText.length >= 50 ? (
              <>
                <FileUp size={16} /> Import from your CV
              </>
            ) : (
              <a href="/resume">
                <FileUp size={16} /> Upload a CV to import from
              </a>
            )}
          </Button>
        }
      />

      {actionError ? (
        <p role="alert" className="evidence-banner evidence-banner--error">
          {actionError}
        </p>
      ) : null}

      {suggestions.length > 0 ? (
        <WorkspacePanel
          kicker="Review"
          title="Suggestions to review"
          description="Facts pulled from your CV or from a tool result. Nothing counts as saved until you accept it."
          actions={
            importedUnconfirmedCount > 0 ? (
              <Button
                variant="outline"
                loading={acceptAllMutation.isPending}
                disabled={acceptAllMutation.isPending}
                onClick={() => acceptAllMutation.mutate()}
              >
                Accept all
              </Button>
            ) : null
          }
        >
          <ul className="evidence-suggestions">
            {suggestions.map((item) => (
              <SuggestionRow
                key={item.id}
                item={item}
                busy={pendingItemId === item.id}
                onAccept={handleConfirm}
                onReject={handleReject}
              />
            ))}
          </ul>
        </WorkspacePanel>
      ) : null}

      {itemsQuery.isLoading ? (
        <div className="evidence-groups" aria-hidden="true">
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} className="evidence-skeleton" />
          ))}
        </div>
      ) : itemsQuery.isError ? (
        <div className="evidence-empty">
          <p>We could not load your profile.</p>
          <Button variant="outline" onClick={() => itemsQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <WorkspaceEmpty
          icon={BadgeCheck}
          title="No facts yet"
          description="Your profile fills up as you import a CV or save a result from one of the tools. Anything added arrives as a suggestion until you accept it."
        />
      ) : (
        <WorkspacePanel
          kicker="All facts"
          title="Grouped by kind"
          description="Correct a mistake, reject it, or delete anything that does not belong."
        >
          <div className="evidence-groups">
            {groups.map((group) => (
              <section key={group.kind} className="evidence-group" aria-label={group.label}>
                <h3 className="evidence-group__title">
                  {group.label}
                  <span className="evidence-group__count">{group.items.length}</span>
                </h3>
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
        </WorkspacePanel>
      )}

      {developmentLoopEnabled ? <SkillsToBuildSection /> : null}

      {items.length > 0 ? (
        <WorkspacePanel
          className="evidence-danger"
          title="Delete your whole profile"
          description="Permanently removes every fact above. This takes effect immediately and cannot be undone."
          actions={
            <Button
              variant="outline"
              className="settings-btn--destructive"
              onClick={() => setPurgeOpen(true)}
            >
              <Trash2 size={14} className="mr-1.5" />
              Delete profile
            </Button>
          }
        >
          <></>
        </WorkspacePanel>
      ) : null}

      {importOpen ? (
        <ResumeImportDialog
          open={importOpen}
          resumeText={resumeText}
          onOpenChange={setImportOpen}
          onImported={invalidateEvidenceOnly}
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
              This permanently removes the item from your profile. It takes effect immediately
              and cannot be undone.
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
            <DialogTitle>Delete your entire profile?</DialogTitle>
            <DialogDescription>
              This permanently removes all {counts.total} {counts.total === 1 ? 'fact' : 'facts'}.
              It happens immediately — we do not keep a backup — and cannot be undone.
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
    </WorkspacePage>
  )
}
