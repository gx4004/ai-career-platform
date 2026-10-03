import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileUp, Trash2 } from 'lucide-react'
import {
  Button, ConfirmDialog, EmptyState, ErrorState, List, MetaRow, Notice, Page, PageHeader, Section, Skeleton, Stack,
} from '#/components/kit'
import { useSession } from '#/hooks/useSession'
import { useResumeCarry } from '#/hooks/use-resume-carry'
import {
  confirmEvidenceItem,
  confirmEvidenceItems,
  deleteEvidenceItem,
  deleteEvidenceProfile,
  importEvidenceFromResume,
  listEvidenceItems,
  updateEvidenceItem,
} from '#/lib/api/client'
import type { EvidenceItem } from '#/lib/api/schemas'
import {
  KIND_SINGULAR_LABELS,
  PROVENANCE_DESCRIPTIONS,
  PROVENANCE_LABELS,
  contentEntries,
  countByState,
  factDisplay,
  groupItemsByKind,
} from '#/lib/profile/evidence'
import { EVIDENCE_QUERY_KEY, invalidateEvidenceCaches } from '#/lib/query/evidenceCaches'
import { EditFactDialog } from '#/components/profile/EditFactDialog'
import { FactRow } from '#/components/profile/FactRow'
import { SkillsToBuildSection } from '#/components/profile/SkillsToBuildSection'

/** The first non-empty value: how a fact is named in buttons and menus. */
function previewText(item: EvidenceItem): string {
  return contentEntries(item.content).find((entry) => entry.value)?.value || 'No details recorded'
}

/**
 * One row template for every kind: the first value leads, the rest follow as plain lines. A saved row under its
 * kind heading only says what is not already obvious (where a fact came from, when it was not typed); a suggestion
 * also names its kind, since it sits in a list of its own.
 */
function evidenceRow(item: EvidenceItem) {
  const { title, fields } = factDisplay(item)
  const filled = fields.filter((field) => field.value && field.value !== '—')
  const lead = title ?? filled[0]?.value ?? 'No details recorded'
  const rest = title ? [] : filled.slice(1)
  const provenance = PROVENANCE_LABELS[item.provenance]
  const meta = [
    item.confirmation_state === 'unconfirmed' ? KIND_SINGULAR_LABELS[item.kind] : null,
    item.provenance !== 'user-entered' ? (
      <span key="source" title={PROVENANCE_DESCRIPTIONS[item.provenance]}>
        <span aria-hidden="true">{provenance}</span>
        <span className="kit-sr-only">Source: {provenance}. {PROVENANCE_DESCRIPTIONS[item.provenance]}</span>
      </span>
    ) : null,
  ]
  const details = (
    <>
      {rest.map((field) => <div key={field.key} className="profile-line">{field.value}</div>)}
      <MetaRow>{meta}</MetaRow>
    </>
  )
  return { lead, details }
}

export function EvidenceProfilePage() {
  const { status, openAuthDialog } = useSession()
  const queryClient = useQueryClient()
  const isAuthenticated = status === 'authenticated'
  const { hasResume, resumeText } = useResumeCarry()
  const [importNotice, setImportNotice] = useState<string | null>(null)
  const [pendingItemId, setPendingItemId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<EvidenceItem | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<EvidenceItem | null>(null)
  const [purgeOpen, setPurgeOpen] = useState(false)

  const itemsQuery = useQuery({
    queryKey: EVIDENCE_QUERY_KEY,
    queryFn: async () => (await listEvidenceItems()).items,
    enabled: isAuthenticated,
  })

  function reportError(error: unknown, fallback: string) {
    setActionError(error instanceof Error ? error.message : fallback)
  }

  async function invalidateProfile() {
    await invalidateEvidenceCaches(queryClient, { rankingMayChange: true })
  }

  // Import stores every extracted fact as a suggestion; nothing is trusted
  // until the owner saves it (D-062).
  const importMutation = useMutation({
    mutationFn: () => importEvidenceFromResume(resumeText),
    onSuccess: async ({ items: imported }) => {
      setImportNotice(
        imported.length === 0
          ? 'We could not find any facts in your CV to suggest.'
          : `Added ${imported.length} ${imported.length === 1 ? 'suggestion' : 'suggestions'} to review.`,
      )
      await queryClient.invalidateQueries({ queryKey: EVIDENCE_QUERY_KEY })
    },
    onError: (error) => reportError(error, 'Could not import from your CV.'),
  })

  const saveMutation = useMutation({
    mutationFn: (id: string) => confirmEvidenceItem(id),
    onSuccess: invalidateProfile,
    onError: (error) => reportError(error, 'Could not save the suggestion.'),
    onSettled: () => setPendingItemId(null),
  })

  const saveAllMutation = useMutation({
    mutationFn: (ids: string[]) => confirmEvidenceItems(ids),
    onSuccess: invalidateProfile,
    onError: (error) => reportError(error, 'Could not save every suggestion.'),
  })

  // Dismissing a suggestion deletes it; no trace is kept.
  const dismissMutation = useMutation({
    mutationFn: (id: string) => deleteEvidenceItem(id),
    onSuccess: invalidateProfile,
    onError: (error) => reportError(error, 'Could not dismiss the suggestion.'),
    onSettled: () => setPendingItemId(null),
  })

  // An edit is the owner typing it, so the API saves it directly (#321).
  const editMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: Record<string, unknown> }) =>
      updateEvidenceItem(id, { content }),
    onSuccess: async () => {
      setEditTarget(null)
      await invalidateProfile()
    },
    onError: (error) =>
      setEditError(error instanceof Error ? error.message : 'Could not save your changes.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteEvidenceItem(id),
    onSuccess: invalidateProfile,
    onError: (error) => reportError(error, 'Could not delete the fact.'),
    onSettled: () => setDeleteTarget(null),
  })

  const purgeMutation = useMutation({
    mutationFn: () => deleteEvidenceProfile(),
    onSuccess: invalidateProfile,
    onError: (error) => reportError(error, 'Could not delete the profile.'),
    onSettled: () => setPurgeOpen(false),
  })

  const items = itemsQuery.data ?? []
  const counts = useMemo(() => countByState(items), [items])
  // Suggestions are listed once, here; the kind groups show saved facts only.
  const suggestions = useMemo(
    () => items.filter((item) => item.confirmation_state === 'unconfirmed'),
    [items],
  )
  const groups = useMemo(
    () => groupItemsByKind(items.filter((item) => item.confirmation_state === 'confirmed')),
    [items],
  )
  const canImport = hasResume && resumeText.length >= 50

  function openEditor(item: EvidenceItem) {
    setEditError(null)
    setEditTarget(item)
  }
  function withPending(item: EvidenceItem, run: (id: string) => void) {
    setPendingItemId(item.id)
    run(item.id)
  }

  if (!isAuthenticated) {
    return (
      <Page>
        <PageHeader
          title="Your profile"
          lead="Sign in to see the facts about your experience that CV Studio and the tools reuse. Save what you stand behind, and remove anything you do not."
          actions={(
            <>
              <Button asChild size="sm" variant="secondary"><Link to="/resume">Explore tools</Link></Button>
              <Button type="button" size="sm" onClick={() => openAuthDialog({ to: '/profile', reason: 'account' })}>Sign in</Button>
            </>
          )}
        />
      </Page>
    )
  }

  const meta = itemsQuery.isError
    ? []
    : itemsQuery.data
      ? items.length > 0
        ? [
            `${counts.confirmed} saved ${counts.confirmed === 1 ? 'fact' : 'facts'}`,
            counts.unconfirmed > 0 ? `${counts.unconfirmed} to review` : null,
          ]
        : []
      : [<Skeleton key="count" size="meta" width="7rem" />]

  return (
    <Page>
      <PageHeader
        title="Your profile"
        meta={meta}
        actions={
          canImport ? (
            <Button size="sm" loading={importMutation.isPending} onClick={() => importMutation.mutate()}>
              <FileUp aria-hidden="true" /> Import from your CV
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link to="/resume"><FileUp aria-hidden="true" /> Upload a CV</Link>
            </Button>
          )
        }
      />

      {actionError || importNotice ? (
        <Stack gap={2}>
          {actionError ? <Notice tone="danger" onDismiss={() => setActionError(null)}>{actionError}</Notice> : null}
          {importNotice ? <Notice onDismiss={() => setImportNotice(null)}>{importNotice}</Notice> : null}
        </Stack>
      ) : null}

      <div className="profile-layout" data-split={suggestions.length > 0 ? 'true' : undefined}>
        {suggestions.length > 0 ? (
          <Section
            className="profile-suggestions"
            title="Suggestions to review"
            description="From your CV or a tool result. Nothing counts until you save it."
            actions={
              suggestions.length > 1 ? (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={saveAllMutation.isPending}
                  onClick={() => saveAllMutation.mutate(suggestions.map((item) => item.id))}
                >
                  Save all
                </Button>
              ) : undefined
            }
          >
            <List aria-label="Suggestions to review" className="profile-suggestions__list">
              {suggestions.map((item) => {
                const { lead, details } = evidenceRow(item)
                const busy = pendingItemId === item.id
                return (
                  <FactRow
                    key={item.id} title={lead} details={details} busy={busy}
                    editLabel={`Edit: ${previewText(item)}`} onEdit={() => openEditor(item)}
                    primary={(
                      <>
                        <Button size="sm" variant="secondary" disabled={busy} aria-label={`Save: ${previewText(item)}`} onClick={() => withPending(item, saveMutation.mutate)}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busy} aria-label={`Dismiss: ${previewText(item)}`} onClick={() => withPending(item, dismissMutation.mutate)}>
                          Dismiss
                        </Button>
                      </>
                    )}
                  />
                )
              })}
            </List>
          </Section>
        ) : null}

        {itemsQuery.isError ? (
          <ErrorState
            title="Your profile couldn’t be loaded"
            description="Your facts are safe. Try again in a moment."
            onRetry={() => void itemsQuery.refetch()}
            retrying={itemsQuery.isFetching}
          />
        ) : (
          <Section
            title="Saved facts"
            description={groups.length > 0 ? 'CV Studio and the tools only use saved facts. Edit one to correct it.' : undefined}
          >
            {itemsQuery.isPending ? (
              <List aria-label="Saved facts" aria-busy="true" className="profile-skeleton"><Skeleton variant="row" as="li" count={4} /></List>
            ) : groups.length === 0 ? (
              <EmptyState
                title={items.length === 0 ? 'No facts yet' : 'Nothing saved yet'}
                description={
                  items.length === 0
                    ? 'Your profile fills up as you import a CV or save a result from one of the tools. Anything added arrives as a suggestion until you save it.'
                    : 'Save a suggestion and it shows up here.'
                }
              />
            ) : (
              <Stack gap={6}>
                {groups.map((group) => (
                  <Section key={group.kind} headingLevel={3} size="sm" title={group.label} count={group.items.length}>
                    <List aria-label={group.label}>
                      {group.items.map((item) => {
                        const { lead, details } = evidenceRow(item)
                        const busy = pendingItemId === item.id || deleteTarget?.id === item.id
                        return (
                          <FactRow
                            key={item.id} title={lead} details={details} busy={busy}
                            editLabel={`Edit: ${previewText(item)}`} onEdit={() => openEditor(item)}
                            reveal={(
                              <Button iconOnly size="sm" variant="ghost" disabled={busy} aria-label={`Delete: ${previewText(item)}`} onClick={() => setDeleteTarget(item)}>
                                <Trash2 aria-hidden="true" />
                              </Button>
                            )}
                          />
                        )
                      })}
                    </List>
                  </Section>
                ))}
              </Stack>
            )}
          </Section>
        )}
      </div>

      <SkillsToBuildSection />

      {items.length > 0 ? (
        <Section
          title="Delete your whole profile"
          rule={false}
          description="Permanently removes every fact above. This takes effect immediately and cannot be undone."
          actions={
            <Button variant="secondary" size="sm" onClick={() => setPurgeOpen(true)}>
              <Trash2 aria-hidden="true" /> Delete profile
            </Button>
          }
        />
      ) : null}

      <EditFactDialog
        item={editTarget}
        submitting={editMutation.isPending}
        error={editError}
        onClose={() => setEditTarget(null)}
        onSubmit={(content) => editTarget && editMutation.mutate({ id: editTarget.id, content })}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this fact?"
        description="This permanently removes it from your profile. It takes effect immediately and cannot be undone."
        confirmLabel="Delete fact"
        icon={<Trash2 />}
        pending={deleteMutation.isPending}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />

      <ConfirmDialog
        open={purgeOpen}
        title="Delete your entire profile?"
        description={`This permanently removes all ${counts.total} ${counts.total === 1 ? 'fact' : 'facts'}. It happens immediately — we do not keep a backup — and cannot be undone.`}
        confirmLabel="Delete everything"
        icon={<Trash2 />}
        pending={purgeMutation.isPending}
        onOpenChange={(open) => { if (!open) setPurgeOpen(false) }}
        onConfirm={() => purgeMutation.mutate()}
      />
    </Page>
  )
}
