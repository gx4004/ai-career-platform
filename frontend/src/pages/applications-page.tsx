import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRightLeft, CalendarClock, CircleCheck, MessageCircleQuestion, Pin, SearchX } from 'lucide-react'
import { PageHero } from '#/components/app/PageHero'
import { StatusPill, WorkspaceEmpty, WorkspacePage } from '#/components/app/WorkspacePage'
import { PrepareForMePanel } from '#/components/applications/PrepareForMePanel'
import { StageMenu } from '#/components/applications/StageMenu'
import {
  STAGES,
  STATUSES,
  STATUS_LABELS,
  applicationTitle,
  formatDate,
  stageOf,
  timeAgo,
} from '#/components/applications/stages'
import { Button } from '#/components/ui/button'
import { listApplications, updateApplication } from '#/lib/api/client'
import type { ApplicationCard, ApplicationList, ApplicationStatus } from '#/lib/api/schemas'
import { getNavDestination } from '#/lib/navigation/navGroups'
import { APPLICATION_BOARD_QUERY_KEY, invalidateApplications } from '#/lib/query/applicationCaches'

const BoardIcon = getNavDestination('/campaigns').icon
const DiscoverIcon = getNavDestination('/discovery').icon

export function ApplicationsPage() {
  const queryClient = useQueryClient()
  const [moveError, setMoveError] = useState<string | null>(null)
  const query = useQuery({ queryKey: APPLICATION_BOARD_QUERY_KEY, queryFn: listApplications })
  const move = useMutation({
    mutationFn: ({ card, status }: { card: ApplicationCard; status: ApplicationStatus }) =>
      updateApplication(card.id, { status }),
    onMutate: () => setMoveError(null),
    onSuccess: (updated) => {
      queryClient.setQueryData<ApplicationList>(APPLICATION_BOARD_QUERY_KEY, (current) =>
        current && {
          ...current,
          items: current.items.map((item) =>
            item.id === updated.id
              ? { ...item, status: updated.status, applied_at: updated.applied_at, ready: updated.ready, updated_at: updated.updated_at }
              : item,
          ),
        },
      )
      void invalidateApplications(queryClient)
    },
    onError: (error, { card }) =>
      setMoveError(`“${applicationTitle(card)}” couldn't be moved. ${error instanceof Error ? error.message : 'Try again.'}`),
  })

  const items = query.data?.items ?? []
  const byStage = (stage: string) => items.filter((item) => stageOf(item.status) === stage)
  const findJobs = <Button asChild><Link to="/discovery"><DiscoverIcon size={16} /> Find jobs</Link></Button>

  return (
    <WorkspacePage wide className="camp-page">
      <PageHero
        icon={BoardIcon}
        title="Your applications"
        purpose="Every job you're going for, from saved to offer."
        action={findJobs}
        chips={query.data ? summaryChips(items) : undefined}
      />

      {moveError ? <p className="camp-alert" role="alert">{moveError}</p> : null}

      {query.isPending ? (
        <div className="camp-board" role="status" aria-label="Loading applications">
          {STAGES.map((stage) => <div key={stage.id} className="camp-col camp-col--skeleton" />)}
        </div>
      ) : query.isError ? (
        <WorkspaceEmpty
          icon={SearchX}
          title="Your applications couldn't be loaded"
          description="Something went wrong on our side."
          action={<Button variant="outline" onClick={() => query.refetch()}>Try again</Button>}
        />
      ) : items.length === 0 ? (
        <WorkspaceEmpty
          icon={BoardIcon}
          title="No applications yet"
          description="Add a job from Job Discovery, or let us prepare applications for you below."
          action={findJobs}
        />
      ) : (
        <div className="camp-board">
          {STAGES.map((stage) => {
            const cards = byStage(stage.id)
            return (
              <section key={stage.id} className={`camp-col camp-col--${stage.id}`} aria-labelledby={`col-${stage.id}`}>
                <header className="camp-col__head">
                  <span className="camp-col__dot" aria-hidden="true" />
                  <h2 id={`col-${stage.id}`}>{stage.label}</h2>
                  <span className="camp-col__count">{cards.length}</span>
                </header>
                {cards.length ? (
                  <ol className="camp-col__list">
                    {cards.map((card) => (
                      <li key={card.id}>
                        <BoardCard
                          card={card}
                          moving={move.isPending && move.variables?.card.id === card.id}
                          onMove={(status) => move.mutate({ card, status })}
                        />
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="camp-col__empty">{stage.hint}</p>
                )}
              </section>
            )
          })}
        </div>
      )}

      <PrepareForMePanel />
    </WorkspacePage>
  )
}

function summaryChips(items: ApplicationCard[]) {
  const inProgress = items.filter((item) => stageOf(item.status) !== 'closed').length
  const ready = items.filter((item) => item.ready).length
  // Every status with a non-zero count gets its chip, in pipeline order.
  const perStatus = STATUSES.filter((status) => status !== 'saved').flatMap((status) => {
    const count = items.filter((item) => item.status === status).length
    if (!count) return []
    return [status === 'offer' && count > 1 ? `${count} offers` : `${count} ${STATUS_LABELS[status].toLowerCase()}`]
  })
  return [`${inProgress} in progress`, ...(ready ? [`${ready} ready to apply`] : []), ...perStatus]
}

function BoardCard({
  card,
  moving,
  onMove,
}: {
  card: ApplicationCard
  moving: boolean
  onMove: (status: ApplicationStatus) => void
}) {
  const title = applicationTitle(card)
  const task = card.next_task
  const closed = stageOf(card.status) === 'closed'
  return (
    <article className="camp-card" aria-busy={moving || undefined}>
      <div className="camp-card__top">
        <div className="camp-card__title">
          <div className="camp-card__name">
            <Link to="/campaigns/$campaignId" params={{ campaignId: card.id }} className="camp-card__link">
              {title}
            </Link>
            {card.is_pinned ? <Pin className="camp-card__pin" size={13} fill="currentColor" aria-label="Pinned" role="img" /> : null}
          </div>
          {card.company ? <span>{card.company}</span> : null}
        </div>
        <StageMenu status={card.status} onMove={onMove} disabled={moving}>
          <button type="button" className="camp-card__move" aria-label={`Move ${title}`}>
            <ArrowRightLeft size={15} aria-hidden="true" />
          </button>
        </StageMenu>
      </div>
      <div className="camp-card__badges">
        {closed || card.status === 'no_reply' ? <StatusPill>{STATUS_LABELS[card.status]}</StatusPill> : null}
        {card.status === 'saved' && card.ready ? (
          <StatusPill tone="positive"><CircleCheck size={12} aria-hidden="true" /> Ready to apply</StatusPill>
        ) : null}
        {card.status === 'saved' && card.open_question_count > 0 ? (
          <StatusPill tone="warning">
            <MessageCircleQuestion size={12} aria-hidden="true" />
            {card.open_question_count === 1 ? '1 question' : `${card.open_question_count} questions`}
          </StatusPill>
        ) : null}
        {card.match_score !== null ? <span className="camp-card__score">{card.match_score}% match</span> : null}
      </div>
      {task ? (
        <p className="camp-card__next">
          <CalendarClock size={14} aria-hidden="true" />
          <span>
            <strong>Next:</strong> {task.title}
            {task.deadline ? <em> · due {formatDate(task.deadline)}</em> : null}
          </span>
        </p>
      ) : card.deadline && card.status === 'saved' ? (
        <p className="camp-card__next">
          <CalendarClock size={14} aria-hidden="true" />
          <span>Apply by {formatDate(card.deadline)}</span>
        </p>
      ) : null}
      {card.no_reply_suggested ? (
        <div className="camp-card__nudge">
          <span>No reply yet?</span>
          <Button size="sm" variant="outline" disabled={moving} onClick={() => onMove('no_reply')}>Mark no reply</Button>
        </div>
      ) : null}
      <p className="camp-card__meta">
        {card.applied_at ? `Applied ${formatDate(card.applied_at)} · ` : ''}
        Last activity {timeAgo(card.last_activity_at ?? card.updated_at)}
      </p>
    </article>
  )
}
