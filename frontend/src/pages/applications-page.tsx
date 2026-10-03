import { useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronDown, MoreHorizontal, Pin } from 'lucide-react'
import { PrepareForMePanel } from '#/components/applications/PrepareForMePanel'
import { WhatsWorkingPanel } from '#/components/applications/WhatsWorkingPanel'
import { StageMenu } from '#/components/applications/StageMenu'
import {
  STAGES,
  STATUSES,
  STATUS_LABELS,
  applicationTitle,
  formatDate,
  stageOf,
  stageTone,
  timeAgo,
  roleOnly,
} from '#/components/applications/stages'
import type { Stage } from '#/components/applications/stages'
import {
  Badge,
  Button,
  Card,
  CardActions,
  CardHeader,
  CardTitle,
  Cluster,
  Count,
  EmptyState,
  ErrorState,
  MetaRow,
  Notice,
  Page,
  PageHeader,
  Section,
  Segmented,
  Skeleton,
  Stack,
  StretchedLink,
  Table,
} from '#/components/kit'
import type { TableColumn } from '#/components/kit'
import { listApplications, updateApplication } from '#/lib/api/client'
import type { ApplicationCard, ApplicationList, ApplicationStatus } from '#/lib/api/schemas'
import { APPLICATION_BOARD_QUERY_KEY, invalidateApplications } from '#/lib/query/applicationCaches'

type View = 'board' | 'list'

// A board card is about this tall once its meta lines are in; the loading placeholder matches it.
const CARD_HEIGHT = 112

// The kit's compact width: one stage at a time instead of five columns.
const COMPACT_QUERY = '(max-width: 767px)'
function useCompact() {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(COMPACT_QUERY)
      query.addEventListener('change', notify)
      return () => query.removeEventListener('change', notify)
    },
    () => window.matchMedia(COMPACT_QUERY).matches,
    () => false,
  )
}

export function ApplicationsPage() {
  const queryClient = useQueryClient()
  const compact = useCompact()
  const [moveError, setMoveError] = useState<string | null>(null)
  const [view, setView] = useState<View>('board')
  const [phoneStage, setPhoneStage] = useState<Stage | null>(null)
  const query = useQuery({ queryKey: APPLICATION_BOARD_QUERY_KEY, queryFn: listApplications })
  const move = useMutation({
    mutationFn: ({ card, status }: { card: ApplicationCard; status: ApplicationStatus }) =>
      updateApplication(card.id, { status }),
    // A refused move (409) is shown, not repeated behind the person's back.
    retry: false,
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
  const firstFilled = STAGES.find((stage) => byStage(stage.id).length > 0)?.id ?? STAGES[0].id
  const shownStage = phoneStage ?? firstFilled
  const moving = (card: ApplicationCard) => move.isPending && move.variables?.card.id === card.id
  const onMove = (card: ApplicationCard, status: ApplicationStatus) => move.mutate({ card, status })

  // Board | List is the view; on a phone the board shows one stage at a time, chosen by a second control.
  const viewSwitch = (
    <Segmented
      aria-label="View"
      size="sm"
      value={view}
      onValueChange={setView}
      options={[
        { value: 'board', label: 'Board' },
        { value: 'list', label: 'List' },
      ]}
    />
  )
  const stageSwitch =
    compact && view === 'board' ? (
      <Segmented
        aria-label="Stage"
        value={shownStage}
        onValueChange={setPhoneStage}
        options={STAGES.map((stage) => ({
          value: stage.id as Stage,
          label: <>{stage.label} <Count value={byStage(stage.id).length} /></>,
        }))}
      />
    ) : null

  return (
    <Page width="wide">
      <PageHeader
        title="Your applications"
        meta={query.isPending ? [<Skeleton key="meta" size="meta" width="7rem" />] : items.length ? summaryMeta(items) : undefined}
        actions={<Button asChild size="sm"><Link to="/discovery">Find jobs</Link></Button>}
      />

      {moveError ? (
        <Notice tone="danger" onDismiss={() => setMoveError(null)}>{moveError}</Notice>
      ) : null}

      {query.isPending ? (
        <>
          <p className="kit-sr-only" role="status">Loading applications</p>
          <div className="camp-board" aria-busy="true">
            {STAGES.filter((stage) => !compact || stage.id === STAGES[0].id).map((stage) => (
              <Column key={stage.id} title={stage.label} compact={compact}>
                {Array.from({ length: stage.id === 'saved' ? 2 : 1 }, (_, index) => (
                  <Skeleton key={index} variant="block" width="100%" height={CARD_HEIGHT} />
                ))}
              </Column>
            ))}
          </div>
        </>
      ) : query.isError ? (
        <ErrorState
          title="Your applications couldn't be loaded"
          description="Something went wrong on our side."
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No applications yet"
          description="Add a job from Discover, or let us prepare applications for you below."
        />
      ) : (
        <Stack gap={3}>
          <Stack gap={2}>
            {viewSwitch}
            {stageSwitch}
          </Stack>
          {view === 'list' ? (
            <ApplicationsTable items={items} moving={moving} onMove={onMove} />
          ) : (
            <div className="camp-board">
              {STAGES.filter((stage) => !compact || stage.id === shownStage).map((stage) => {
                const cards = byStage(stage.id)
                return (
                  <Column key={stage.id} title={stage.label} count={cards.length} compact={compact}>
                    {cards.length ? (
                      <ol className="camp-col__list" role="list">
                        {cards.map((card) => (
                          <li key={card.id}>
                            <BoardCard
                              card={card}
                              compact={compact}
                              moving={moving(card)}
                              onMove={(status) => onMove(card, status)}
                            />
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <EmptyState size="inline" title={stage.hint} />
                    )}
                  </Column>
                )
              })}
            </div>
          )}
        </Stack>
      )}

      <WhatsWorkingPanel compact={compact} />

      <PrepareForMePanel />
    </Page>
  )
}

/** A board column: a heading with its count and the cards under it. On a phone the stage switcher names it. */
function Column({
  title,
  count,
  compact,
  children,
}: {
  title: string
  count?: number
  compact: boolean
  children: ReactNode
}) {
  if (compact) return <section aria-label={title}>{children}</section>
  return (
    <Section headingLevel={2} title={title} count={count} rule={false}>
      {children}
    </Section>
  )
}

function summaryMeta(items: ApplicationCard[]) {
  // Per-stage counts live in the board's column headings; the header only adds what they don't say.
  const inProgress = items.filter((item) => stageOf(item.status) !== 'closed').length
  const ready = items.filter((item) => item.ready).length
  return [`${inProgress} in progress`, ...(ready ? [`${ready} ready to apply`] : [])]
}

function nextParts(card: ApplicationCard): string[] {
  const task = card.next_task
  if (task) return [`Next: ${task.title}`, ...(task.deadline ? [`due ${formatDate(task.deadline)}`] : [])]
  if (card.deadline && card.status === 'saved') return [`Apply by ${formatDate(card.deadline)}`]
  return []
}

const nextStep = (card: ApplicationCard) => nextParts(card).join(' · ') || null

function BoardCard({
  card,
  compact,
  moving,
  onMove,
}: {
  card: ApplicationCard
  compact: boolean
  moving: boolean
  onMove: (status: ApplicationStatus) => void
}) {
  const title = roleOnly(applicationTitle(card), card.company)
  const closed = stageOf(card.status) === 'closed'
  const next = nextParts(card)
  const ready = card.status === 'saved' && card.ready
  const questions = card.status === 'saved' ? card.open_question_count : 0
  const showStatus = closed || card.status === 'no_reply'
  return (
    <Card aria-busy={moving || undefined}>
      <CardHeader>
        <CardTitle headingLevel={compact ? 2 : 3} asChild>
          <Link to="/campaigns/$campaignId" params={{ campaignId: card.id }}>{title}</Link>
        </CardTitle>
        {card.is_pinned ? <Pin className="camp-pin" size={12} fill="currentColor" aria-label="Pinned" role="img" /> : null}
        <CardActions>
          <StageMenu status={card.status} onMove={onMove} disabled={moving}>
            <Button iconOnly variant="ghost" size="sm" aria-label={`Move ${title}`}>
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </StageMenu>
        </CardActions>
      </CardHeader>
      {card.company || card.match_score !== null ? (
        <MetaRow>
          {card.company}
          {card.match_score !== null ? <span aria-label={`${card.match_score}% skills fit`}>{card.match_score}% fit</span> : null}
        </MetaRow>
      ) : null}
      {next.length ? <MetaRow>{next}</MetaRow> : null}
      {showStatus || ready || questions > 0 ? (
        <Cluster gap={1} className="camp-card__badges">
          {showStatus ? <Badge size="sm">{STATUS_LABELS[card.status]}</Badge> : null}
          {ready ? <Badge size="sm" tone="success">Ready to apply</Badge> : null}
          {questions > 0 ? <Badge size="sm" tone="warning">{questions === 1 ? '1 question' : `${questions} questions`}</Badge> : null}
        </Cluster>
      ) : null}
      {card.no_reply_suggested ? (
        <Cluster justify="between" gap={2}>
          <MetaRow>{['No reply yet?']}</MetaRow>
          <CardActions reveal={false}>
            <Button size="sm" variant="secondary" disabled={moving} onClick={() => onMove('no_reply')}>Mark no reply</Button>
          </CardActions>
        </Cluster>
      ) : null}
    </Card>
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
  const columns: TableColumn<ApplicationCard>[] = [
    {
      id: 'role',
      header: 'Role',
      primary: true,
      cell: (card) => {
        const title = roleOnly(applicationTitle(card), card.company)
        return (
          <>
            <StretchedLink asChild>
              <Link className="camp-wrap" to="/campaigns/$campaignId" params={{ campaignId: card.id }}>{title}</Link>
            </StretchedLink>
            {card.is_pinned ? <Pin className="camp-pin camp-pin--inline" size={12} fill="currentColor" aria-label="Pinned" role="img" /> : null}
          </>
        )
      },
    },
    { id: 'company', header: 'Company', cell: (card) => <span className="camp-wrap">{card.company ?? '–'}</span> },
    { id: 'fit', header: 'Skills fit', numeric: true, cell: (card) => (card.match_score !== null ? `${card.match_score}%` : '–') },
    { id: 'next', header: 'Next step', cell: (card) => <span className="camp-wrap">{nextStep(card)?.replace(/^Next: /, '') ?? '–'}</span> },
    { id: 'activity', header: 'Last activity', cell: (card) => timeAgo(card.last_activity_at ?? card.updated_at) },
    {
      id: 'stage',
      header: 'Stage',
      hideHeader: true,
      align: 'end',
      stackLabel: false,
      cell: (card) => {
        const title = roleOnly(applicationTitle(card), card.company)
        return (
          <StageMenu status={card.status} onMove={(status) => onMove(card, status)} disabled={moving(card)}>
            <Button variant="ghost" size="sm" aria-label={`Move ${title}`}>
              <Badge tone={stageTone(card.status)}>{STATUS_LABELS[card.status]}</Badge>
              <ChevronDown aria-hidden="true" />
            </Button>
          </StageMenu>
        )
      },
    },
  ]
  return (
    <Table
      caption="Applications"
      columns={columns}
      rows={rows}
      getRowId={(card) => card.id}
      getRowProps={(card) => ({ 'aria-busy': moving(card) || undefined })}
    />
  )
}
