import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Check,
  CircleSlash,
  FileText,
  Pause,
  Pencil,
  Play,
  SkipForward,
  X,
} from 'lucide-react'
import { PageFrame } from '#/components/app/PageFrame'
import {
  acceptPacket,
  answerPacketStopQuestion,
  editPacket,
  getQueueState,
  listPackets,
  pauseQueue,
  rejectPacket,
  resumeQueue,
  skipPacket,
} from '#/lib/api/client'
import type {
  ApplicationPacketItem,
  UnresolvedQuestion,
} from '#/lib/api/packetSchemas'

const PACKETS_KEY = ['queue', 'packets']
const QUEUE_STATE_KEY = ['queue', 'state']

// A stop question the owner can answer inline vs. the non-stop "no CV selected"
// question, which is resolved by selecting a CV (D-095), not by typing an answer.
function isAnswerable(question: UnresolvedQuestion): boolean {
  return question.category !== 'missing_material'
}

export function QueuePage() {
  const queryClient = useQueryClient()

  const packetsQuery = useQuery({
    queryKey: PACKETS_KEY,
    queryFn: listPackets,
    staleTime: 30_000,
  })
  const stateQuery = useQuery({
    queryKey: QUEUE_STATE_KEY,
    queryFn: getQueueState,
    staleTime: 30_000,
  })

  // Authoritative remaining unresolved questions per packet. Seeded from each packet,
  // then replaced by the server's answer result so the accept control stays in lock-step
  // with what the backend will actually enforce (D-095).
  const [remaining, setRemaining] = useState<Record<string, UnresolvedQuestion[]>>({})
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({})
  const [actionError, setActionError] = useState<string | null>(null)

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: PACKETS_KEY })
    queryClient.invalidateQueries({ queryKey: QUEUE_STATE_KEY })
  }

  const pauseMutation = useMutation({
    mutationFn: pauseQueue,
    onSuccess: () => invalidateAll(),
  })
  const resumeMutation = useMutation({
    mutationFn: resumeQueue,
    onSuccess: () => invalidateAll(),
  })
  const decisionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'skip' | 'reject' | 'edit' }) => {
      if (action === 'accept') return acceptPacket(id)
      if (action === 'skip') return skipPacket(id)
      if (action === 'reject') return rejectPacket(id)
      return editPacket(id)
    },
    onSuccess: () => {
      setActionError(null)
      invalidateAll()
    },
    onError: (error: unknown) => {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'Action failed'
      setActionError(message)
    },
  })
  const answerMutation = useMutation({
    mutationFn: ({ id, field, answer }: { id: string; field: string; answer: string }) =>
      answerPacketStopQuestion(id, { field, answer }),
    onSuccess: (result) => {
      setRemaining((prev) => ({ ...prev, [result.packet_id]: result.unresolved_questions }))
      setDraftAnswers((prev) => ({ ...prev, [`${result.packet_id}:${result.resolved_field}`]: '' }))
    },
  })

  const outstandingFor = (packet: ApplicationPacketItem): UnresolvedQuestion[] =>
    remaining[packet.id] ?? packet.unresolved_questions

  const paused = stateQuery.data?.paused ?? false
  const regressionHalted = stateQuery.data?.preparation_halted ?? false
  const packets = packetsQuery.data?.items ?? []

  return (
    <PageFrame className="queue-page">
      <header className="queue-header">
        <div>
          <h1 className="queue-title">Application queue</h1>
          <p className="queue-subtitle">
            Review each prepared packet, answer any unresolved questions, then accept,
            edit, skip, or reject it. Pause halts all preparation instantly.
          </p>
        </div>
        <button
          type="button"
          className={`queue-pause-toggle${paused ? ' is-paused' : ''}`}
          aria-pressed={paused}
          disabled={pauseMutation.isPending || resumeMutation.isPending}
          onClick={() => (paused ? resumeMutation.mutate() : pauseMutation.mutate())}
        >
          {paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
          {paused ? 'Resume queue' : 'Pause queue'}
        </button>
      </header>

      {paused ? (
        <div className="queue-banner queue-banner--paused" role="status">
          <Pause size={18} aria-hidden="true" />
          <span>
            <strong>Queue paused.</strong> Preparation is halted — no new packets are
            prepared until you resume.
          </span>
        </div>
      ) : null}
      {regressionHalted ? (
        <div className="queue-banner queue-banner--halted" role="status">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>
            <strong>Preparation is halted</strong> by a quality regression. New packets
            resume automatically once the regression clears.
          </span>
        </div>
      ) : null}

      {actionError ? (
        <div className="queue-banner queue-banner--error" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      ) : null}

      {packetsQuery.isLoading ? (
        <p className="queue-empty">Loading your prepared packets…</p>
      ) : packets.length === 0 ? (
        <p className="queue-empty">
          No packets yet. Once preparation runs, prepared packets appear here for review.
        </p>
      ) : (
        <ul className="queue-list" aria-label="Prepared application packets">
          {packets.map((packet) => {
            const outstanding = outstandingFor(packet)
            const blocked = outstanding.length > 0
            const isPending = packet.decision === 'pending'
            const accepted = packet.decision === 'accepted'
            const acting = decisionMutation.isPending && decisionMutation.variables?.id === packet.id
            return (
              <li key={packet.id}>
                <article
                  className="queue-card"
                  aria-labelledby={`packet-${packet.id}-title`}
                >
                  <div className="queue-card__head">
                    <h2 id={`packet-${packet.id}-title`} className="queue-card__title">
                      Packet {packet.id.slice(0, 8)}
                    </h2>
                    <span
                      className={`queue-decision queue-decision--${packet.decision}`}
                      data-testid={`decision-${packet.id}`}
                    >
                      {packet.decision}
                    </span>
                  </div>

                  <section className="queue-rationale" aria-label="Match rationale">
                    <p className="queue-rationale__score">
                      Match score:{' '}
                      <strong>{packet.match_rationale.composite_score} / 100</strong>
                    </p>
                    {packet.match_rationale.signals.length > 0 ? (
                      <ul className="queue-signals">
                        {packet.match_rationale.signals.map((signal, index) => (
                          <li key={`${packet.id}-signal-${index}`}>
                            {signal.label}
                            {signal.matched_keywords.length > 0
                              ? `: ${signal.matched_keywords.join(', ')}`
                              : ''}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </section>

                  <section className="queue-materials" aria-label="Referenced materials">
                    <h3 className="queue-section-title">
                      <FileText size={15} aria-hidden="true" /> Materials (by reference)
                    </h3>
                    <ul className="queue-refs">
                      <li>Campaign: {packet.campaign_id}</li>
                      <li>CV variant: {packet.cv_variant_id ?? 'not selected'}</li>
                      <li>Drafts: {packet.drafts_run_id ?? 'none'}</li>
                      {packet.review_run_id ? <li>Quality review: {packet.review_run_id}</li> : null}
                    </ul>
                  </section>

                  {blocked ? (
                    <section
                      className="queue-unresolved"
                      aria-label="Unresolved questions blocking approval"
                    >
                      <h3 className="queue-section-title queue-section-title--warn">
                        <AlertTriangle size={15} aria-hidden="true" /> Unresolved questions
                        block acceptance
                      </h3>
                      <ul className="queue-questions">
                        {outstanding.map((question) => {
                          const key = `${packet.id}:${question.field}`
                          const answering =
                            answerMutation.isPending &&
                            answerMutation.variables?.id === packet.id &&
                            answerMutation.variables?.field === question.field
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
                                    answerMutation.mutate({
                                      id: packet.id,
                                      field: question.field,
                                      answer,
                                    })
                                  }}
                                >
                                  <label className="queue-visually-hidden" htmlFor={`answer-${key}`}>
                                    Your answer to: {question.question}
                                  </label>
                                  <textarea
                                    id={`answer-${key}`}
                                    className="queue-answer-input"
                                    rows={2}
                                    value={draftAnswers[key] ?? ''}
                                    onChange={(event) =>
                                      setDraftAnswers((prev) => ({
                                        ...prev,
                                        [key]: event.target.value,
                                      }))
                                    }
                                  />
                                  <button
                                    type="submit"
                                    className="queue-btn queue-btn--answer"
                                    disabled={answering || !(draftAnswers[key] ?? '').trim()}
                                  >
                                    {answering ? 'Saving…' : 'Save answer'}
                                  </button>
                                </form>
                              ) : (
                                <p className="queue-question__hint">
                                  <CircleSlash size={14} aria-hidden="true" /> Select or tailor a
                                  CV variant to resolve this — it cannot be answered here.
                                </p>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  ) : null}

                  <div className="queue-actions" role="group" aria-label={`Actions for packet ${packet.id.slice(0, 8)}`}>
                    <button
                      type="button"
                      className="queue-btn queue-btn--accept"
                      disabled={blocked || acting || !isPending}
                      aria-disabled={blocked}
                      title={
                        blocked
                          ? 'Answer every unresolved question before accepting'
                          : 'Accept this packet'
                      }
                      onClick={() => decisionMutation.mutate({ id: packet.id, action: 'accept' })}
                    >
                      <Check size={16} aria-hidden="true" /> Accept
                    </button>
                    <button
                      type="button"
                      className="queue-btn queue-btn--edit"
                      disabled={acting || accepted}
                      title={accepted ? 'This packet has already been accepted' : undefined}
                      onClick={() => decisionMutation.mutate({ id: packet.id, action: 'edit' })}
                    >
                      <Pencil size={16} aria-hidden="true" /> Edit
                    </button>
                    <button
                      type="button"
                      className="queue-btn queue-btn--skip"
                      disabled={acting || accepted}
                      title={accepted ? 'This packet has already been accepted' : undefined}
                      onClick={() => decisionMutation.mutate({ id: packet.id, action: 'skip' })}
                    >
                      <SkipForward size={16} aria-hidden="true" /> Skip
                    </button>
                    <button
                      type="button"
                      className="queue-btn queue-btn--reject"
                      disabled={acting || accepted}
                      title={accepted ? 'This packet has already been accepted' : undefined}
                      onClick={() => decisionMutation.mutate({ id: packet.id, action: 'reject' })}
                    >
                      <X size={16} aria-hidden="true" /> Reject
                    </button>
                  </div>
                  {blocked ? (
                    <p className="queue-accept-hint" id={`accept-hint-${packet.id}`}>
                      Accept is disabled until every unresolved question is answered.
                    </p>
                  ) : null}
                </article>
              </li>
            )
          })}
        </ul>
      )}
    </PageFrame>
  )
}
