import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Copy,
  Inbox,
  Pause,
  Pencil,
  Play,
  Plus,
  SkipForward,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react'
import {
  StatusPill,
  WorkspaceEmpty,
  WorkspaceHero,
  WorkspacePage,
  WorkspacePanel,
} from '#/components/app/WorkspacePage'
import { Button } from '#/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { useSession } from '#/hooks/useSession'
import {
  acceptPacket,
  answerPacketStopQuestion,
  autofillPacket,
  deleteQueueRule,
  editPacket,
  getPacketApprovalPreview,
  getQueueSettings,
  getQueueState,
  listPackets,
  listQueueRules,
  markPacketApplied,
  pauseQueue,
  preparePackets,
  rejectPacket,
  resumeQueue,
  skipPacket,
  updateQueueSettings,
  upsertQueueRule,
} from '#/lib/api/client'
import { ApiError } from '#/lib/api/errors'
import { isAutopilotExperimentEnabled } from '#/lib/flags/featureFlags'
import {
  QUEUE_QUERY_ROOT,
  queuePacketsQueryKey,
  queueRulesQueryKey,
  queueSettingsQueryKey,
  queueStateQueryKey,
} from '#/lib/api/queueCache'
import type {
  ApplicationPacketItem,
  PacketApprovalPreview,
  UnresolvedQuestion,
} from '#/lib/api/packetSchemas'
import type { PacketPreparationResult } from '#/lib/api/packetSchemas'
import type { QueueRuleItem } from '#/lib/api/queueSchemas'

// A stop question the owner can answer inline vs. the non-stop "no CV selected"
// question, which is resolved by picking a CV (D-095), not by typing an answer.
function isAnswerable(question: UnresolvedQuestion): boolean {
  return question.category !== 'missing_material'
}

function truncate(text: string | undefined | null, max: number): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean
}

function matchTone(score: number): 'good' | 'fair' | 'low' {
  if (score >= 70) return 'good'
  if (score >= 41) return 'fair'
  return 'low'
}

type DraftsCover = { body?: string }
type DraftsAnswer = { question: string; answer: string }
type PreviewContent = PacketApprovalPreview['content']

function draftsCover(content: PreviewContent | undefined): DraftsCover | undefined {
  const drafts = content?.drafts as { cover_letter?: DraftsCover } | null | undefined
  return drafts?.cover_letter ?? undefined
}

function draftsAnswers(content: PreviewContent | undefined): DraftsAnswer[] {
  const drafts = content?.drafts as { screening_answers?: DraftsAnswer[] } | null | undefined
  return drafts?.screening_answers ?? []
}

function usePreview(userId: string, packetId: string | null) {
  return useQuery({
    queryKey: [...QUEUE_QUERY_ROOT, userId, 'approval-preview', packetId],
    queryFn: () => getPacketApprovalPreview(packetId as string),
    enabled: packetId !== null,
    staleTime: 0,
  })
}

export function QueuePage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { user } = useSession()
  const userId = user?.id ?? null
  const ownerKey = userId ?? 'guest'
  const packetsKey = queuePacketsQueryKey(ownerKey)
  const queueStateKey = queueStateQueryKey(ownerKey)
  const rulesKey = queueRulesQueryKey(ownerKey)
  const settingsKey = queueSettingsQueryKey(ownerKey)

  const packetsQuery = useQuery({
    queryKey: packetsKey,
    queryFn: listPackets,
    enabled: userId !== null,
    staleTime: 30_000,
  })
  const stateQuery = useQuery({
    queryKey: queueStateKey,
    queryFn: getQueueState,
    enabled: userId !== null,
    staleTime: 30_000,
  })
  const rulesQuery = useQuery({
    queryKey: rulesKey,
    queryFn: listQueueRules,
    enabled: userId !== null,
    staleTime: 30_000,
  })
  const settingsQuery = useQuery({
    queryKey: settingsKey,
    queryFn: getQueueSettings,
    enabled: userId !== null,
    staleTime: 30_000,
  })

  const [openPacketId, setOpenPacketId] = useState<string | null>(null)
  const [reviewed, setReviewed] = useState<Record<string, string | null>>({})
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({})
  const [actionError, setActionError] = useState<string | null>(null)
  const [prepareResult, setPrepareResult] = useState<PacketPreparationResult | null>(null)

  // Local review state is owner-sensitive: clearing it on an auth change keeps a
  // mounted route from showing the previous owner's draft answers or open drawer.
  useEffect(() => {
    setOpenPacketId(null)
    setReviewed({})
    setDraftAnswers({})
    setActionError(null)
    setPrepareResult(null)
  }, [userId])

  useEffect(() => {
    const clearOwnerState = () => {
      setOpenPacketId(null)
      setReviewed({})
      setDraftAnswers({})
      setActionError(null)
      setPrepareResult(null)
    }
    window.addEventListener('cw:session-expired', clearOwnerState)
    return () => window.removeEventListener('cw:session-expired', clearOwnerState)
  }, [])

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: packetsKey })
    queryClient.invalidateQueries({ queryKey: queueStateKey })
  }

  const pauseMutation = useMutation({ mutationFn: pauseQueue, onSuccess: invalidateAll })
  const resumeMutation = useMutation({ mutationFn: resumeQueue, onSuccess: invalidateAll })

  const decisionMutation = useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: string
      action: 'accept' | 'skip' | 'reject' | 'edit'
    }) => {
      if (action === 'accept') {
        const materialSha256 = reviewed[id]
        if (!materialSha256) throw new Error('Look over this application before approving it.')
        return acceptPacket(id, materialSha256)
      }
      if (action === 'skip') return skipPacket(id)
      if (action === 'reject') return rejectPacket(id)
      return editPacket(id)
    },
    onSuccess: (_result, variables) => {
      setActionError(null)
      if (variables.action === 'accept' || variables.action === 'skip' || variables.action === 'reject') {
        setOpenPacketId(null)
      }
      if (variables.action === 'edit') {
        void navigate({ to: '/cv-studio' })
      }
      invalidateAll()
    },
    onError: (error: unknown, variables) => {
      if (error instanceof ApiError && error.status === 409 && variables.action === 'accept') {
        setActionError('This application changed since you last looked. Look it over again.')
        setReviewed((prev) => ({ ...prev, [variables.id]: null }))
        queryClient.invalidateQueries({
          queryKey: [...QUEUE_QUERY_ROOT, ownerKey, 'approval-preview', variables.id],
        })
        return
      }
      setActionError(error instanceof Error ? error.message : 'That action did not go through.')
    },
  })

  const answerMutation = useMutation({
    mutationFn: ({ id, field, answer }: { id: string; field: string; answer: string }) =>
      answerPacketStopQuestion(id, { field, answer }),
    onSuccess: (result) => {
      setReviewed((prev) => ({ ...prev, [result.packet_id]: null }))
      queryClient.invalidateQueries({
        queryKey: [...QUEUE_QUERY_ROOT, ownerKey, 'approval-preview', result.packet_id],
      })
      setDraftAnswers((prev) => ({ ...prev, [`${result.packet_id}:${result.resolved_field}`]: '' }))
      invalidateAll()
    },
  })

  const appliedMutation = useMutation({
    mutationFn: (id: string) => markPacketApplied(id),
    onSuccess: invalidateAll,
    onError: (error: unknown) => {
      setActionError(error instanceof Error ? error.message : 'Could not mark this as applied.')
    },
  })

  const prepareMutation = useMutation({
    mutationFn: preparePackets,
    onSuccess: (result) => {
      setPrepareResult(result)
      invalidateAll()
    },
  })

  const ruleMutation = useMutation({
    mutationFn: async ({ ruleType, keywords }: { ruleType: 'role' | 'location'; keywords: string[] }) =>
      keywords.length > 0
        ? upsertQueueRule({ rule_type: ruleType, keywords })
        : deleteQueueRule(ruleType),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rulesKey }),
  })

  const settingsMutation = useMutation({
    mutationFn: updateQueueSettings,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKey }),
  })

  const packets = packetsQuery.data?.items ?? []
  const readyPackets = packets.filter((packet) => packet.decision === 'pending')
  const approvedPackets = packets.filter((packet) => packet.decision === 'accepted')
  const appliedCount = approvedPackets.filter((packet) => packet.applied_at !== null).length
  const paused = stateQuery.data?.paused ?? false
  const openPacket = packets.find((packet) => packet.id === openPacketId) ?? null
  const nothingYet = packetsQuery.isSuccess && packets.length === 0

  return (
    <WorkspacePage className="queue-page">
      <WorkspaceHero
        icon={Inbox}
        eyebrow="Application queue"
        title="Application queue"
        subtitle="We prepare applications for the jobs you picked. You look each one over, then apply on the company site yourself."
        stats={[
          { label: 'Ready to review', value: readyPackets.length },
          { label: 'Approved', value: approvedPackets.length - appliedCount },
          { label: 'Applied', value: appliedCount },
        ]}
        actions={
          <button
            type="button"
            className={`queue-pause-toggle${paused ? ' is-paused' : ''}`}
            aria-pressed={paused}
            disabled={pauseMutation.isPending || resumeMutation.isPending}
            onClick={() => (paused ? resumeMutation.mutate() : pauseMutation.mutate())}
          >
            {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
            {paused ? 'Resume queue' : 'Pause queue'}
          </button>
        }
      />

      {paused ? (
        <div className="queue-banner queue-banner--paused" role="status">
          <Pause size={17} aria-hidden="true" />
          <span>
            <strong>Queue paused.</strong> We won't prepare any new applications until you
            resume it.
          </span>
        </div>
      ) : null}

      {actionError ? (
        <div className="queue-banner queue-banner--error" role="alert">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      ) : null}

      {nothingYet ? (
        <WorkspaceEmpty
          icon={Inbox}
          title="Nothing in your queue yet"
          description="Pick a few jobs on Discover, or set your rules below and prepare applications for the ones that match."
          action={
            <Link to="/discovery">
              <Button type="button">Discover jobs</Button>
            </Link>
          }
        />
      ) : null}

      {readyPackets.length > 0 ? (
        <WorkspacePanel
          kicker="Waiting on you"
          title="Ready for review"
          description="Open each one, look it over, then approve, skip, or reject it."
        >
          <ul className="queue-cards" aria-label="Applications ready for review">
            {readyPackets.map((packet) => (
              <li key={packet.id}>
                <ReadyCard
                  packet={packet}
                  userId={ownerKey}
                  onOpen={() => setOpenPacketId(packet.id)}
                />
              </li>
            ))}
          </ul>
        </WorkspacePanel>
      ) : null}

      {approvedPackets.length > 0 ? (
        <WorkspacePanel
          kicker="Ready to send"
          title="Approved — apply now"
          description="Open the official listing, submit it yourself, then mark it applied."
        >
          <ul className="queue-cards" aria-label="Approved applications">
            {approvedPackets.map((packet) => (
              <li key={packet.id}>
                <ApprovedCard
                  packet={packet}
                  userId={ownerKey}
                  onOpen={() => setOpenPacketId(packet.id)}
                  onMarkApplied={() => appliedMutation.mutate(packet.id)}
                  marking={appliedMutation.isPending && appliedMutation.variables === packet.id}
                />
              </li>
            ))}
          </ul>
        </WorkspacePanel>
      ) : null}

      <RulesPanel
        rules={rulesQuery.data?.items ?? []}
        settings={settingsQuery.data ?? null}
        loading={rulesQuery.isLoading || settingsQuery.isLoading}
        onSaveKeywords={(ruleType, keywords) => ruleMutation.mutate({ ruleType, keywords })}
        savingRule={ruleMutation.isPending}
        onSaveCap={(maxPacketsPerRun) => {
          if (!settingsQuery.data) return
          settingsMutation.mutate({
            max_packets_per_run: maxPacketsPerRun,
            cost_ceiling_usd: settingsQuery.data.cost_ceiling_usd,
          })
        }}
        savingCap={settingsMutation.isPending}
        paused={paused}
        onPrepare={() => prepareMutation.mutate()}
        preparing={prepareMutation.isPending}
        prepareResult={prepareResult}
      />

      <Sheet open={openPacket !== null} onOpenChange={(open) => { if (!open) setOpenPacketId(null) }}>
        <SheetContent side="right" className="queue-drawer">
          {openPacket ? (
            <PacketDrawer
              packet={openPacket}
              userId={ownerKey}
              reviewed={Boolean(reviewed[openPacket.id])}
              onAcknowledge={(value) =>
                setReviewed((prev) => ({ ...prev, [openPacket.id]: value }))}
              draftAnswers={draftAnswers}
              onDraftChange={(key, value) =>
                setDraftAnswers((prev) => ({ ...prev, [key]: value }))}
              onAnswer={(field, answer) =>
                answerMutation.mutate({ id: openPacket.id, field, answer })}
              answering={answerMutation.isPending ? answerMutation.variables?.id : undefined}
              onAccept={() => decisionMutation.mutate({ id: openPacket.id, action: 'accept' })}
              onSkip={() => decisionMutation.mutate({ id: openPacket.id, action: 'skip' })}
              onReject={() => decisionMutation.mutate({ id: openPacket.id, action: 'reject' })}
              onEdit={() => decisionMutation.mutate({ id: openPacket.id, action: 'edit' })}
              onMarkApplied={() => appliedMutation.mutate(openPacket.id)}
              marking={appliedMutation.isPending && appliedMutation.variables === openPacket.id}
              acting={decisionMutation.isPending}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </WorkspacePage>
  )
}

// ── Cards ──

function ReadyCard({
  packet,
  userId,
  onOpen,
}: {
  packet: ApplicationPacketItem
  userId: string
  onOpen: () => void
}) {
  const preview = usePreview(userId, packet.id)
  const content = preview.data?.content
  const listing = content?.listing
  const score = packet.match_rationale.composite_score
  const needsAnswers = packet.unresolved_questions.length > 0

  return (
    <article className="queue-card" aria-labelledby={`ready-${packet.id}`}>
      <div className="queue-card__top">
        <div className="queue-card__heading">
          <h3 id={`ready-${packet.id}`}>{listing?.title ?? (preview.isLoading ? 'Loading…' : 'This application')}</h3>
          {listing ? <p className="queue-card__company">{listing.company}</p> : null}
        </div>
        <span className={`queue-match queue-match--${matchTone(score)}`}>
          <strong>{score}%</strong>
          <span>match</span>
        </span>
      </div>
      {needsAnswers ? (
        <StatusPill tone="warning">Needs your answers</StatusPill>
      ) : null}
      <dl className="queue-card__facts">
        <div>
          <dt>CV version</dt>
          <dd>{content?.cv_variant?.name ?? 'Not selected yet'}</dd>
        </div>
        <div>
          <dt>Cover letter</dt>
          <dd>{truncate(draftsCover(content)?.body, 140) || 'No cover letter drafted.'}</dd>
        </div>
      </dl>
      <div className="queue-card__footer">
        <Button type="button" size="sm" onClick={onOpen}>
          Review application
        </Button>
      </div>
    </article>
  )
}

function ApprovedCard({
  packet,
  userId,
  onOpen,
  onMarkApplied,
  marking,
}: {
  packet: ApplicationPacketItem
  userId: string
  onOpen: () => void
  onMarkApplied: () => void
  marking: boolean
}) {
  const preview = usePreview(userId, packet.id)
  const content = preview.data?.content
  const listing = content?.listing
  const applied = packet.applied_at !== null

  return (
    <article className="queue-card" aria-labelledby={`approved-${packet.id}`}>
      <div className="queue-card__top">
        <div className="queue-card__heading">
          <h3 id={`approved-${packet.id}`}>{listing?.title ?? (preview.isLoading ? 'Loading…' : 'This application')}</h3>
          {listing ? <p className="queue-card__company">{listing.company}</p> : null}
        </div>
        {applied ? (
          <StatusPill tone="positive"><CheckCircle2 size={13} aria-hidden="true" /> Applied</StatusPill>
        ) : (
          <StatusPill tone="accent">Approved</StatusPill>
        )}
      </div>
      <CopyList content={content} />
      <div className="queue-card__footer queue-card__footer--approved">
        <Button asChild size="sm" disabled={!preview.data?.destination_url}>
          <a
            href={preview.data?.destination_url ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!preview.data?.destination_url}
          >
            Apply on company site <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onOpen}>
          View details
        </Button>
        {applied ? null : (
          <Button type="button" size="sm" variant="ghost" onClick={onMarkApplied} loading={marking}>
            <Check size={14} aria-hidden="true" /> Mark as applied
          </Button>
        )}
      </div>
      {isAutopilotExperimentEnabled() && !applied && preview.data?.destination_url ? (
        <AutofillBlock packetId={packet.id} />
      ) : null}
    </article>
  )
}

// Autopilot experiment (#325): local-only, off by default, stops before submit.
function AutofillBlock({ packetId }: { packetId: string }) {
  const autofill = useMutation({ mutationFn: () => autofillPacket(packetId) })
  const report = autofill.data
  return (
    <div className="queue-autofill">
      <div className="queue-autofill__row">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => autofill.mutate()}
          loading={autofill.isPending}
        >
          <Wand2 size={14} aria-hidden="true" /> Fill the form for me (experimental)
        </Button>
        <p className="queue-autofill__hint">
          Opens the company form in a browser on this computer and fills what it can. You
          check it and press submit yourself.
        </p>
      </div>
      {autofill.isError ? (
        <p className="queue-autofill__error" role="alert">
          {autofill.error instanceof Error ? autofill.error.message : 'Could not fill the form.'}
        </p>
      ) : null}
      {report ? (
        <div className="queue-autofill__report" role="status">
          <p>
            <strong>Filled:</strong> {report.filled.length > 0 ? report.filled.join(', ') : 'nothing'}
          </p>
          {report.skipped.length > 0 ? (
            <p>
              <strong>Fill these yourself (highlighted in the form):</strong>{' '}
              {report.skipped.join(', ')}
            </p>
          ) : null}
          <p>Nothing was submitted. Check the browser window and press submit when you're happy.</p>
        </div>
      ) : null}
    </div>
  )
}

function CopyList({ content }: { content: PreviewContent | undefined }) {
  const cover = draftsCover(content)
  const answers = draftsAnswers(content)
  if (!cover?.body && answers.length === 0) return null
  return (
    <ul className="queue-copy-list">
      {cover?.body ? <CopyItem label="Cover letter" text={cover.body} /> : null}
      {answers.map((answer, index) => (
        <CopyItem key={`${answer.question}-${index}`} label={answer.question} text={answer.answer} />
      ))}
    </ul>
  )
}

function CopyItem({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <li className="queue-copy-item">
      <div className="queue-copy-item__text">
        <span className="queue-copy-item__label">{label}</span>
        <p>{truncate(text, 160)}</p>
      </div>
      <button
        type="button"
        className="queue-copy-btn"
        aria-label={`Copy ${label}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          } catch {
            // Clipboard access can be denied; the text stays visible to copy by hand.
          }
        }}
      >
        {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </li>
  )
}

// ── Review drawer ──

function PacketDrawer({
  packet,
  userId,
  reviewed,
  onAcknowledge,
  draftAnswers,
  onDraftChange,
  onAnswer,
  answering,
  onAccept,
  onSkip,
  onReject,
  onEdit,
  onMarkApplied,
  marking,
  acting,
}: {
  packet: ApplicationPacketItem
  userId: string
  reviewed: boolean
  onAcknowledge: (value: string | null) => void
  draftAnswers: Record<string, string>
  onDraftChange: (key: string, value: string) => void
  onAnswer: (field: string, answer: string) => void
  answering: string | undefined
  onAccept: () => void
  onSkip: () => void
  onReject: () => void
  onEdit: () => void
  onMarkApplied: () => void
  marking: boolean
  acting: boolean
}) {
  const preview = usePreview(userId, packet.id)
  const content = preview.data?.content
  const listing = content?.listing
  const cover = draftsCover(content)
  const answers = draftsAnswers(content)
  const blocked = packet.unresolved_questions.length > 0
  const accepted = packet.decision === 'accepted'

  return (
    <div className="queue-drawer__inner">
      <SheetHeader className="queue-drawer__head">
        <SheetTitle>{listing?.title ?? 'Application'}</SheetTitle>
        <SheetDescription>
          {listing ? `${listing.company} · ` : ''}
          {packet.match_rationale.composite_score}% match
        </SheetDescription>
      </SheetHeader>

      {preview.isLoading ? <p role="status">Loading the application…</p> : null}
      {preview.isError ? (
        <div role="alert" className="queue-drawer__section">
          <p>This application could not be loaded.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => preview.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}

      {content ? (
        <>
          {!accepted && blocked ? (
            <section className="queue-drawer__section queue-questions" aria-label="Questions to answer before approving">
              <h4 className="queue-drawer__section-title">
                <AlertTriangle size={15} aria-hidden="true" /> Before you can approve this
              </h4>
              <ul>
                {packet.unresolved_questions.map((question) => {
                  const key = `${packet.id}:${question.field}`
                  const isAnswering = answering === packet.id
                  return (
                    <li key={key} className="queue-question">
                      <p className="queue-question__text">{question.question}</p>
                      {isAnswerable(question) ? (
                        <form
                          className="queue-answer-form"
                          onSubmit={(event) => {
                            event.preventDefault()
                            const answer = (draftAnswers[key] ?? '').trim()
                            if (!answer) return
                            onAnswer(question.field, answer)
                          }}
                        >
                          <label className="queue-visually-hidden" htmlFor={`answer-${key}`}>
                            Your answer to: {question.question}
                          </label>
                          <textarea
                            id={`answer-${key}`}
                            className="workspace-textarea"
                            rows={2}
                            value={draftAnswers[key] ?? ''}
                            onChange={(event) => onDraftChange(key, event.target.value)}
                          />
                          <Button type="submit" size="sm" disabled={isAnswering || !(draftAnswers[key] ?? '').trim()}>
                            {isAnswering ? 'Saving…' : 'Save answer'}
                          </Button>
                        </form>
                      ) : (
                        <p className="queue-question__hint">
                          Pick or tailor a CV to resolve this — it can't be answered here.
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}

          <section className="queue-drawer__section" aria-label="CV version">
            <h4 className="queue-drawer__section-title">CV version</h4>
            {content.cv_variant ? (
              <>
                <p className="queue-drawer__cv-name">{content.cv_variant.name}</p>
                <div className="queue-cv-sections">
                  {(content.cv_variant.sections as CvSection[]).map((section, index) => (
                    <div key={section.id ?? index} className="queue-cv-section">
                      <h5>{section.title ?? section.kind}</h5>
                      {(section.entries ?? []).map((entry, entryIndex) => (
                        <div key={entry.id ?? entryIndex} className="queue-cv-entry">
                          {entry.heading ? <p className="queue-cv-entry__heading">{entry.heading}</p> : null}
                          {entry.bullets && entry.bullets.length > 0 ? (
                            <ul>
                              {entry.bullets.map((bullet, bulletIndex) => (
                                <li key={bulletIndex}>{bullet}</li>
                              ))}
                            </ul>
                          ) : entry.body ? (
                            <p>{entry.body}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="queue-question__hint">No CV version selected yet.</p>
            )}
          </section>

          {cover?.body ? (
            <section className="queue-drawer__section" aria-label="Cover letter">
              <h4 className="queue-drawer__section-title">Cover letter</h4>
              <p className="queue-drawer__cover">{cover.body}</p>
            </section>
          ) : null}

          {answers.length > 0 ? (
            <section className="queue-drawer__section" aria-label="Screening answers">
              <h4 className="queue-drawer__section-title">Screening answers</h4>
              <dl className="queue-drawer__qa">
                {answers.map((answer, index) => (
                  <div key={index}>
                    <dt>{answer.question}</dt>
                    <dd>{answer.answer}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {accepted ? (
            <div className="queue-drawer__actions">
              {preview.data?.destination_url ? (
                <Button asChild size="sm">
                  <a href={preview.data.destination_url} target="_blank" rel="noopener noreferrer">
                    Apply on company site <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                </Button>
              ) : null}
              {packet.applied_at === null ? (
                <Button type="button" size="sm" variant="outline" onClick={onMarkApplied} loading={marking}>
                  <Check size={14} aria-hidden="true" /> Mark as applied
                </Button>
              ) : (
                <StatusPill tone="positive"><CheckCircle2 size={13} aria-hidden="true" /> Applied</StatusPill>
              )}
            </div>
          ) : (
            <>
              <label className="queue-confirm">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(event) =>
                    onAcknowledge(event.target.checked ? (preview.data?.material_sha256 ?? null) : null)}
                />
                I've looked this over and I'm ready to approve it.
              </label>
              <div className="queue-drawer__actions">
                <Button
                  type="button"
                  size="sm"
                  disabled={blocked || acting || !reviewed}
                  title={
                    blocked
                      ? 'Answer every question above before approving'
                      : !reviewed
                        ? 'Confirm you looked this over first'
                        : 'Approve this application'
                  }
                  onClick={onAccept}
                >
                  <Check size={14} aria-hidden="true" /> Approve
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={onEdit} disabled={acting}>
                  <Pencil size={14} aria-hidden="true" /> Edit in CV Studio
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={onSkip} disabled={acting}>
                  <SkipForward size={14} aria-hidden="true" /> Skip
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={onReject} disabled={acting}>
                  <X size={14} aria-hidden="true" /> Reject
                </Button>
              </div>
            </>
          )}
        </>
      ) : null}
    </div>
  )
}

type CvSection = {
  id?: string
  kind?: string
  title?: string
  entries?: { id?: string; heading?: string; bullets?: string[]; body?: string }[]
}

// ── Rules ──

function RulesPanel({
  rules,
  settings,
  loading,
  onSaveKeywords,
  savingRule,
  onSaveCap,
  savingCap,
  paused,
  onPrepare,
  preparing,
  prepareResult,
}: {
  rules: QueueRuleItem[]
  settings: { max_packets_per_run: number; cost_ceiling_usd: number } | null
  loading: boolean
  onSaveKeywords: (ruleType: 'role' | 'location', keywords: string[]) => void
  savingRule: boolean
  onSaveCap: (value: number) => void
  savingCap: boolean
  paused: boolean
  onPrepare: () => void
  preparing: boolean
  prepareResult: PacketPreparationResult | null
}) {
  const roleRule = rules.find((rule) => rule.rule_type === 'role')
  const locationRule = rules.find((rule) => rule.rule_type === 'location')
  const roleKeywords = roleRule?.keywords ?? []
  const locationKeywords = locationRule?.keywords ?? []
  const remoteOn = locationKeywords.some((keyword) => keyword.toLowerCase() === 'remote')
  const hasAnyRule = roleKeywords.length > 0 || locationKeywords.length > 0

  const [capDraft, setCapDraft] = useState<string | null>(null)
  const capValue = capDraft ?? (settings ? String(settings.max_packets_per_run) : '')

  return (
    <WorkspacePanel
      kicker="Rules"
      title="What we prepare for you"
      description="With no rules set, we prepare nothing. Add a keyword or location so we know which jobs to prepare applications for."
    >
      {loading ? (
        <p className="queue-question__hint">Loading your rules…</p>
      ) : (
        <div className="queue-rules">
          <KeywordsField
            label="Keywords"
            placeholder="e.g. backend engineer"
            value={roleKeywords}
            saving={savingRule}
            onChange={(next) => onSaveKeywords('role', next)}
          />
          <div className="queue-rule-group">
            <KeywordsField
              label="Locations"
              placeholder="e.g. Berlin"
              value={locationKeywords.filter((keyword) => keyword.toLowerCase() !== 'remote')}
              saving={savingRule}
              onChange={(next) => onSaveKeywords('location', remoteOn ? [...next, 'remote'] : next)}
            />
            <label className="queue-remote-toggle">
              <input
                type="checkbox"
                checked={remoteOn}
                onChange={(event) => {
                  const withoutRemote = locationKeywords.filter((keyword) => keyword.toLowerCase() !== 'remote')
                  onSaveKeywords('location', event.target.checked ? [...withoutRemote, 'remote'] : withoutRemote)
                }}
              />
              Remote only
            </label>
          </div>
          <label className="workspace-field queue-rule-cap">
            <span className="workspace-field__label">Daily limit</span>
            <input
              type="number"
              min={1}
              max={1000}
              className="workspace-input"
              value={capValue}
              disabled={!settings}
              onChange={(event) => setCapDraft(event.target.value)}
              onBlur={() => {
                const parsed = Number.parseInt(capValue, 10)
                if (Number.isFinite(parsed) && parsed > 0) onSaveCap(parsed)
                setCapDraft(null)
              }}
            />
          </label>
        </div>
      )}
      <div className="queue-prepare">
        <Button
          type="button"
          variant="outline"
          onClick={onPrepare}
          loading={preparing || savingCap}
          disabled={!hasAnyRule || paused}
        >
          <Sparkles size={14} aria-hidden="true" /> Prepare applications now
        </Button>
        {prepareResult ? (
          <p className="queue-prepare__result">
            {prepareResult.prepares
              ? `Prepared ${prepareResult.prepared_count} new application${prepareResult.prepared_count === 1 ? '' : 's'}.`
              : prepareResult.reason === 'no_rules_defined'
                ? 'Add a keyword or location above first.'
                : 'The queue is paused — resume it to prepare applications.'}
          </p>
        ) : null}
      </div>
    </WorkspacePanel>
  )
}

function KeywordsField({
  label,
  placeholder,
  value,
  saving,
  onChange,
}: {
  label: string
  placeholder: string
  value: string[]
  saving: boolean
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  return (
    <div className="queue-rule-field">
      <span className="workspace-field__label">{label}</span>
      {value.length > 0 ? (
        <ul className="queue-chips">
          {value.map((keyword) => (
            <li key={keyword} className="queue-chip">
              {keyword}
              <button
                type="button"
                aria-label={`Remove ${keyword}`}
                onClick={() => onChange(value.filter((item) => item !== keyword))}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="queue-rule-add"
        onSubmit={(event) => {
          event.preventDefault()
          const next = draft.trim()
          if (!next || value.some((item) => item.toLowerCase() === next.toLowerCase())) return
          onChange([...value, next])
          setDraft('')
        }}
      >
        <input
          className="workspace-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          aria-label={label}
        />
        <Button type="submit" size="sm" variant="outline" disabled={saving || !draft.trim()}>
          <Plus size={13} aria-hidden="true" /> Add
        </Button>
      </form>
    </div>
  )
}
