import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, FileUp, Pencil, Trash2, X } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import { AppStatePanel } from '#/components/app/AppStatePanel'
import { ConfirmDeleteDialog } from '#/components/app/ConfirmDeleteDialog'
import { PageHero } from '#/components/app/PageHero'
import { WorkspacePage } from '#/components/app/WorkspacePage'
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
  STATE_LABELS,
  contentEntries,
  countByState,
  factDisplay,
  groupItemsByKind,
} from '#/lib/profile/evidence'
import { EVIDENCE_QUERY_KEY, invalidateEvidenceCaches } from '#/lib/query/evidenceCaches'
import { EditFactDialog } from '#/components/profile/EditFactDialog'
import { FactCard, type FactMenuItem } from '#/components/profile/FactCard'
import { SkillsToBuildSection } from '#/components/profile/SkillsToBuildSection'

/** The first non-empty value: how a fact is named in buttons and menus. */
function previewText(item: EvidenceItem): string {
  return contentEntries(item.content).find((entry) => entry.value)?.value || 'No details recorded'
}

function EvidenceCard({
  item,
  busy,
  primary,
  menu,
}: {
  item: EvidenceItem
  busy: boolean
  primary: React.ReactNode
  menu: FactMenuItem[]
}) {
  const state = item.confirmation_state
  const { title, fields } = factDisplay(item)
  const provenance = `${PROVENANCE_LABELS[item.provenance]}. ${PROVENANCE_DESCRIPTIONS[item.provenance]}`
  return (
    <FactCard
      tone={state}
      busy={busy}
      title={title}
      meta={
        <>
          <span className="fact-card__kind">{KIND_SINGULAR_LABELS[item.kind]}</span>
          <Badge
            variant="outline"
            className={`fact-badge fact-badge--${state}`}
            title={provenance}
          >
            {STATE_LABELS[state]}
          </Badge>
          {/* A title tooltip is invisible on touch, so the source is also
              available to assistive tech as text. */}
          <span className="sr-only">{`Source: ${provenance}`}</span>
          {state === 'confirmed' ? (
            <span className="fact-card__source" aria-hidden="true">
              {PROVENANCE_LABELS[item.provenance]}
            </span>
          ) : null}
        </>
      }
      fields={fields}
      primary={primary}
      menu={menu}
      menuLabel={`More actions: ${previewText(item)}`}
    />
  )
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
    window.setTimeout(() => setActionError(null), 4000)
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
      <AppStatePanel
        title="Your profile"
        description="Sign in to see the facts about your experience that CV Studio and the tools reuse — save what you stand behind, and remove anything you do not."
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

  const heroChips = itemsQuery.data
    ? [
        `${counts.confirmed} saved ${counts.confirmed === 1 ? 'fact' : 'facts'}`,
        ...(counts.unconfirmed > 0 ? [`${counts.unconfirmed} to review`] : []),
      ]
    : undefined

  return (
    <WorkspacePage className="profile-page">
      <PageHero
        title="Your profile"
        purpose="The facts about you that CV Studio and the tools reuse."
        chips={heroChips}
        action={
          canImport ? (
            <Button loading={importMutation.isPending} onClick={() => importMutation.mutate()}>
              <FileUp size={16} /> Import from your CV
            </Button>
          ) : (
            <Button asChild>
              <Link to="/resume">
                <FileUp size={16} /> Upload a CV
              </Link>
            </Button>
          )
        }
      />

      {actionError ? (
        <p role="alert" className="profile-banner profile-banner--error">
          {actionError}
        </p>
      ) : null}
      {importNotice ? (
        <p role="status" className="profile-banner">
          {importNotice}
        </p>
      ) : null}

      <div className={suggestions.length > 0 ? 'profile-layout profile-layout--split' : 'profile-layout'}>
        {suggestions.length > 0 ? (
          <section className="profile-section" aria-labelledby="profile-suggestions-title">
            <div className="profile-section__head">
              <div>
                <h2 id="profile-suggestions-title" className="profile-section__title">Suggestions to review</h2>
                <p className="profile-section__description">
                  From your CV or a tool result. Nothing counts until you save it.
                </p>
              </div>
              {suggestions.length > 1 ? (
                <Button
                  variant="outline"
                  size="sm"
                  loading={saveAllMutation.isPending}
                  onClick={() => saveAllMutation.mutate(suggestions.map((item) => item.id))}
                >
                  Save all
                </Button>
              ) : null}
            </div>
            <ul className="fact-list" aria-label="Suggestions to review">
              {suggestions.map((item) => (
                <EvidenceCard
                  key={item.id}
                  item={item}
                  busy={pendingItemId === item.id}
                  primary={
                    <>
                      <Button
                        size="sm"
                        disabled={pendingItemId === item.id}
                        aria-label={`Save: ${previewText(item)}`}
                        onClick={() => withPending(item, saveMutation.mutate)}
                      >
                        <Check size={14} /> Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pendingItemId === item.id}
                        aria-label={`Dismiss: ${previewText(item)}`}
                        onClick={() => withPending(item, dismissMutation.mutate)}
                      >
                        <X size={14} /> Dismiss
                      </Button>
                    </>
                  }
                  menu={[{ label: 'Edit', icon: Pencil, onSelect: () => openEditor(item) }]}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {itemsQuery.isLoading ? (
          <div className="fact-groups" aria-hidden="true">
            {[0, 1, 2].map((n) => (
              <Skeleton key={n} className="fact-skeleton" />
            ))}
          </div>
        ) : itemsQuery.isError ? (
          <p className="profile-empty">
            We could not load your profile.{' '}
            <Button variant="outline" size="sm" onClick={() => itemsQuery.refetch()}>
              Try again
            </Button>
          </p>
        ) : items.length === 0 ? (
          <p className="profile-empty">
            No facts yet. Your profile fills up as you import a CV or save a result from one of the
            tools. Anything added arrives as a suggestion until you save it.
          </p>
        ) : groups.length > 0 ? (
          <section className="profile-section" aria-labelledby="profile-saved-title">
            <div className="profile-section__head">
              <div>
                <h2 id="profile-saved-title" className="profile-section__title">Saved facts</h2>
                <p className="profile-section__description">
                  CV Studio and the tools only use saved facts. Edit one to correct it.
                </p>
              </div>
            </div>
            <div className="fact-groups">
              {groups.map((group) => (
                <section key={group.kind} className="fact-group" aria-label={group.label}>
                  <h3 className="fact-group__title">
                    {group.label}
                    <span className="fact-group__count">{group.items.length}</span>
                  </h3>
                  <ul className="fact-list">
                    {group.items.map((item) => (
                      <EvidenceCard
                        key={item.id}
                        item={item}
                        busy={pendingItemId === item.id || deleteTarget?.id === item.id}
                        primary={
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`Edit: ${previewText(item)}`}
                            onClick={() => openEditor(item)}
                          >
                            <Pencil size={14} /> Edit
                          </Button>
                        }
                        menu={[
                          {
                            label: 'Delete',
                            icon: Trash2,
                            destructive: true,
                            onSelect: () => setDeleteTarget(item),
                          },
                        ]}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <SkillsToBuildSection />

      {items.length > 0 ? (
        <section className="profile-section profile-danger">
          <div className="profile-section__head">
            <div>
              <h2 className="profile-section__title">Delete your whole profile</h2>
              <p className="profile-section__description">
                Permanently removes every fact above. This takes effect immediately and cannot be undone.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="settings-btn--destructive"
              onClick={() => setPurgeOpen(true)}
            >
              <Trash2 size={14} className="mr-1.5" />
              Delete profile
            </Button>
          </div>
        </section>
      ) : null}

      <EditFactDialog
        item={editTarget}
        submitting={editMutation.isPending}
        error={editError}
        onClose={() => setEditTarget(null)}
        onSubmit={(content) => editTarget && editMutation.mutate({ id: editTarget.id, content })}
      />

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        title="Delete this fact?"
        description="This permanently removes it from your profile. It takes effect immediately and cannot be undone."
        confirmLabel="Delete fact"
        pending={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />

      <ConfirmDeleteDialog
        open={purgeOpen}
        title="Delete your entire profile?"
        description={`This permanently removes all ${counts.total} ${counts.total === 1 ? 'fact' : 'facts'}. It happens immediately — we do not keep a backup — and cannot be undone.`}
        confirmLabel="Delete everything"
        pending={purgeMutation.isPending}
        onCancel={() => setPurgeOpen(false)}
        onConfirm={() => purgeMutation.mutate()}
      />
    </WorkspacePage>
  )
}
