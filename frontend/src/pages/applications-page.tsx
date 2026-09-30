import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRightLeft, ChevronDown, Pin } from 'lucide-react'
import { PageFrame } from '#/components/app/PageFrame'
import { PageHero } from '#/components/app/PageHero'
import { PrepareForMePanel } from '#/components/applications/PrepareForMePanel'
import { WhatsWorkingPanel } from '#/components/applications/WhatsWorkingPanel'
import { StageMenu } from '#/components/applications/StageMenu'
import { Badge, EmptyLine } from '#/components/applications/Panel'
import {
  STAGES,
  STATUSES,
  STATUS_LABELS,
  applicationTitle,
  formatDate,
  stageOf,
  stageTone,
  timeAgo,
} from '#/components/applications/stages'
import { Button } from '#/components/ui/button'
import { listApplications, updateApplication } from '#/lib/api/client'
import type { ApplicationCard, ApplicationList, ApplicationStatus } from '#/lib/api/schemas'
import { APPLICATION_BOARD_QUERY_KEY, invalidateApplications } from '#/lib/query/applicationCaches'

type View = 'board' | 'list'

export function ApplicationsPage() {
  const queryClient = useQueryClient()
  const [moveError, setMoveError] = useState<string | null>(null)
  const [view, setView] = useState<View>('board')
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
  const findJobs = <Button asChild size="sm"><Link to="/discovery">Find jobs</Link></Button>
  const moving = (card: ApplicationCard) => move.isPending && move.variables?.card.id === card.id

  return (
    <PageFrame className="camp-page camp-page--board">
      <PageHero
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
        <EmptyLine action={<Button variant="outline" size="sm" onClick={() => query.refetch()}>Try again</Button>}>
          Your applications couldn't be loaded. Something went wrong on our side.
        </EmptyLine>
      ) : items.length === 0 ? (
        <EmptyLine action={findJobs}>
          No applications yet. Add a job from Job Discovery, or let us prepare applications for you below.
        </EmptyLine>
      ) : (
        <>
          <div className="camp-toolbar">
            <div className="camp-segment" role="group" aria-label="View">
              <button type="button" aria-pressed={view === 'board'} onClick={() => setView('board')}>Board</button>
              <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
            </div>
          </div>
          {view === 'board' ? (
            <div className="camp-board">
              {STAGES.map((stage) => {
                const cards = byStage(stage.id)
                return (
                  <section key={stage.id} className={`camp-col camp-col--${stage.id}`} aria-labelledby={`col-${stage.id}`}>
                    <header className="camp-col__head">
                      <h2 id={`col-${stage.id}`}>{stage.label}</h2>
                      <span className="camp-col__count">{cards.length}</span>
                    </header>
                    {cards.length ? (
                      <ol className="camp-col__list">
                        {cards.map((card) => (
                          <li key={card.id}>
                            <BoardCard card={card} moving={moving(card)} onMove={(status) => move.mutate({ card, status })} />
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
          ) : (
            <ApplicationsTable items={items} moving={moving} onMove={(card, status) => move.mutate({ card, status })} />
          )}
        </>
      )}

      <WhatsWorkingPanel />

      <PrepareForMePanel />
    </PageFrame>
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

function nextStep(card: ApplicationCard) {
  const task = card.next_task
  if (task) return `Next: ${task.title}${task.deadline ? ` · due ${formatDate(task.deadline)}` : ''}`
  if (card.deadline && card.status === 'saved') return `Apply by ${formatDate(card.deadline)}`
  return null
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
  const closed = stageOf(card.status) === 'closed'
  const next = nextStep(card)
  return (
    <article className="camp-card" aria-busy={moving || undefined}>
      <div className="camp-card__top">
        <Link to="/campaigns/$campaignId" params={{ campaignId: card.id }} className="camp-card__link" title={title}>
          {title}
        </Link>
        {card.is_pinned ? <Pin className="camp-card__pin" size={12} fill="currentColor" aria-label="Pinned" role="img" /> : null}
        <StageMenu status={card.status} onMove={onMove} disabled={moving}>
          <button type="button" className="camp-card__move" aria-label={`Move ${title}`}>
            <ArrowRightLeft size={14} aria-hidden="true" />
          </button>
        </StageMenu>
      </div>
      <p className="camp-card__meta">
        {card.company ? <span className="camp-card__company">{card.company}</span> : null}
        {card.match_score !== null ? <span className="camp-card__fit">{card.match_score}% skills fit</span> : null}
        {next ? <span className="camp-card__next" title={next}>{next}</span> : null}
      </p>
      {closed || card.status === 'no_reply' || (card.status === 'saved' && (card.ready || card.open_question_count > 0)) ? (
        <div className="camp-card__badges">
          {closed || card.status === 'no_reply' ? <Badge>{STATUS_LABELS[card.status]}</Badge> : null}
          {card.status === 'saved' && card.ready ? <Badge tone="positive">Ready to apply</Badge> : null}
          {card.status === 'saved' && card.open_question_count > 0 ? (
            <Badge tone="warning">{card.open_question_count === 1 ? '1 question' : `${card.open_question_count} questions`}</Badge>
          ) : null}
        </div>
      ) : null}
      {card.no_reply_suggested ? (
        <div className="camp-card__nudge">
          <span>No reply yet?</span>
          <Button size="xs" variant="outline" disabled={moving} onClick={() => onMove('no_reply')}>Mark no reply</Button>
        </div>
      ) : null}
      <p className="camp-card__activity">
        {card.applied_at ? `Applied ${formatDate(card.applied_at)} · ` : ''}
        Last activity {timeAgo(card.last_activity_at ?? card.updated_at)}
      </p>
    </article>
  )
}

function ApplicationsTable({
  items,
  moving,
  onMove,
}: {
  items: ApplicationCard[]
  moving: (card: ApplicationCard) => boolean
  onMove: (card: ApplicationCard, status: ApplicationStatus) => void
}) {
  const order = (card: ApplicationCard) => STATUSES.indexOf(card.status)
  const rows = [...items].sort((a, b) => order(a) - order(b))
  return (
    <div className="camp-table-wrap">
      <table className="camp-table">
        <thead>
          <tr>
            <th scope="col">Stage</th>
            <th scope="col">Role</th>
            <th scope="col">Company</th>
            <th scope="col" className="is-num">Skills fit</th>
            <th scope="col">Next step</th>
            <th scope="col">Last activity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((card) => {
            const title = applicationTitle(card)
            return (
              <tr key={card.id} aria-busy={moving(card) || undefined}>
                <td>
                  <StageMenu status={card.status} onMove={(status) => onMove(card, status)} disabled={moving(card)}>
                    <button type="button" className="camp-stage-button" aria-label={`Move ${title}`}>
                      <Badge tone={stageTone(card.status)}>{STATUS_LABELS[card.status]}</Badge>
                      <ChevronDown size={12} aria-hidden="true" />
                    </button>
                  </StageMenu>
                </td>
                <td className="camp-table__role">
                  <Link to="/campaigns/$campaignId" params={{ campaignId: card.id }} title={title}>{title}</Link>
                  {card.is_pinned ? <Pin size={12} fill="currentColor" aria-label="Pinned" role="img" /> : null}
                </td>
                <td>{card.company ?? '-'}</td>
                <td className="is-num">{card.match_score !== null ? `${card.match_score}%` : '-'}</td>
                <td className="camp-table__next">{nextStep(card)?.replace(/^Next: /, '') ?? '-'}</td>
                <td>{timeAgo(card.last_activity_at ?? card.updated_at)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
