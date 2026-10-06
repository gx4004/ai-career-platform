import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Briefcase, ChevronDown, MoreHorizontal, Pin, Plus } from 'lucide-react'
import { AddApplicationDialog } from '#/components/applications/AddApplicationDialog'
import { PrepareForMePanel } from '#/components/applications/PrepareForMePanel'
import { WhatsWorkingPanel } from '#/components/applications/WhatsWorkingPanel'
import { StageMenu } from '#/components/applications/StageMenu'
import { cardUrgency, urgencySortKey } from '#/components/applications/deadlines'
import {
  STAGES,
  STATUSES,
  STATUS_LABELS,
  applicationTitle,
  formatDate,
  stageOf,
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
  FitStamp,
  MetaRow,
  Notice,
  Page,
  PageHeader,
  Section,
  Segmented,
  Skeleton,
  Stack,
  StageMark,
  Sticker,
  StretchedLink,
  Table,
} from '#/components/kit'
import type { TableColumn, TableSort } from '#/components/kit'
import { useSession } from '#/hooks/useSession'
import { getApplicationInsights, getApplicationPreferences, listApplications, updateApplication } from '#/lib/api/client'
import type { ApplicationCard, ApplicationDetail, ApplicationList, ApplicationStatus } from '#/lib/api/schemas'
import {
  APPLICATION_BOARD_QUERY_KEY,
  APPLICATION_INSIGHTS_QUERY_KEY,
  APPLICATION_PREFERENCES_QUERY_KEY,
  invalidateApplications,
} from '#/lib/query/applicationCaches'

type View = 'board' | 'list'

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
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState<ApplicationDetail | null>(null)
  const query = useQuery({ queryKey: APPLICATION_BOARD_QUERY_KEY, queryFn: listApplications })
  // 'unreachable' is a signed-in browser that cannot reach the server, not a failure of this page: until the
  // board has loaded it waits like 'loading' (the service banner explains the outage) instead of showing errors.
  const { status: session } = useSession()
  const waiting = query.isPending || (session === 'unreachable' && !query.isSuccess) || (session === 'loading' && query.isError)
  // What's working and Prepare load alongside the board but only appear once the board has settled and their own
  // data is in: they then arrive whole at the end of the page, instead of growing from a short placeholder and
  // pushing down what sits under them.
  const insights = useQuery({ queryKey: APPLICATION_INSIGHTS_QUERY_KEY, queryFn: getApplicationInsights })
  const preferences = useQuery({ queryKey: APPLICATION_PREFERENCES_QUERY_KEY, queryFn: getApplicationPreferences })
  const panelsReady = !waiting && !insights.isPending && !preferences.isPending
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
      // "Added … to Saved" stops being true once that card moves on.
      setAdded((current) => (current?.id === updated.id ? null : current))
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
  // A job added by hand lands in Saved: put it on the board at once and show that column.
  const onAdded = (created: ApplicationDetail) => {
    setAdding(false)
    setAdded(created)
    setView('board')
    setPhoneStage('saved')
    queryClient.setQueryData<ApplicationList>(APPLICATION_BOARD_QUERY_KEY, (current) =>
      current && !current.items.some((item) => item.id === created.id)
        ? { ...current, items: [created, ...current.items], total: current.total + 1 }
        : current,
    )
    void invalidateApplications(queryClient)
  }

  // Board | List is the view; on a phone the board shows one stage at a time, chosen by a second control.
  // Both controls are already in place (disabled) while the board loads, so nothing under them moves when it arrives.
  const viewSwitch = (
    <Segmented
      aria-label="View"
      size="sm"
      disabled={waiting}
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
      <StageSwitcher value={shownStage}>
        <Segmented
          aria-label="Stage"
          disabled={waiting}
          value={shownStage}
          onValueChange={setPhoneStage}
          options={STAGES.map((stage) => ({
            value: stage.id as Stage,
            label: <>{stage.label} <Count value={waiting ? '–' : byStage(stage.id).length} /></>,
          }))}
        />
      </StageSwitcher>
    ) : null

  return (
    <Page width="wide">
      <PageHeader
        title="Your applications"
        meta={waiting ? [<Skeleton key="meta" size="meta" width="7rem" />] : items.length ? summaryMeta(items) : undefined}
        actions={
          <Cluster gap={2} justify="end">
            {/* Held in place (disabled) while the board loads, so the header does not shift when it arrives. */}
            {waiting || items.length ? (
              <Button size="sm" variant="secondary" aria-label="Add a job by hand" disabled={waiting} onClick={() => setAdding(true)}>
                <Plus aria-hidden="true" /> Add a job
              </Button>
            ) : null}
            <Button asChild size="sm" variant={query.isSuccess && items.length === 0 ? 'secondary' : 'primary'}>
              <Link to="/discovery">Find jobs</Link>
            </Button>
          </Cluster>
        }
      />

      {added ? (
        <Notice
          tone="success"
          onDismiss={() => setAdded(null)}
          action={
            <Button asChild size="sm" variant="secondary">
              <Link to="/campaigns/$campaignId" params={{ campaignId: added.id }}>Open it</Link>
            </Button>
          }
        >
          Added {roleOnly(applicationTitle(added), added.company)}{added.company ? ` at ${added.company}` : ''} to Saved.
        </Notice>
      ) : null}

      {moveError ? (
        <Notice tone="danger" onDismiss={() => setMoveError(null)}>{moveError}</Notice>
      ) : null}

      {waiting ? (
        <>
          <p className="kit-sr-only" role="status">Loading applications</p>
          <Stack gap={3}>
            <Stack gap={2}>
              {viewSwitch}
              {stageSwitch}
            </Stack>
            <div className="camp-board" aria-busy="true">
              {STAGES.filter((stage) => !compact || stage.id === STAGES[0].id).map((stage) => (
                <Column key={stage.id} stage={stage.id} title={stage.label} count="pending" compact={compact}>
                  <ol className="camp-col__list" role="list">
                    {Array.from({ length: stage.id === 'saved' ? 2 : 1 }, (_, index) => (
                      <li key={index}>
                        {/* The real card's frame from the first frame: only its lines arrive later. */}
                        <Card as="div" aria-hidden="true">
                          <Skeleton width="72%" />
                          <Skeleton size="meta" lines={2} width="55%" />
                        </Card>
                      </li>
                    ))}
                  </ol>
                </Column>
              ))}
            </div>
          </Stack>
        </>
      ) : query.isError ? (
        <ErrorState
          title="Your applications couldn't be loaded"
          description="Something went wrong on our side."
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      ) : items.length === 0 ? (
        <FirstJob onAdd={() => setAdding(true)} />
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
                  <Column key={stage.id} stage={stage.id} title={stage.label} count={cards.length} compact={compact}>
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
                      <EmptyState size="inline" variant="slot" title={stage.hint} />
                    )}
                  </Column>
                )
              })}
            </div>
          )}
        </Stack>
      )}

      {panelsReady ? (
        <>
          <WhatsWorkingPanel compact={compact} />
          <PrepareForMePanel />
        </>
      ) : null}

      <AddApplicationDialog open={adding} onOpenChange={setAdding} onCreated={onAdded} />
    </Page>
  )
}

/**
 * The phone's five stages are wider than the screen: the kit's edge fade says more are scrolled off, arrow
 * keys inside the group reach every stage, and the chosen stage is always scrolled into the middle of view.
 */
function StageSwitcher({ value, children }: { value: Stage; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current
      ?.querySelector<HTMLElement>('[role="radiogroup"] [aria-checked="true"]')
      // Centred, so neither edge fade sits over the chosen stage's name and count.
      ?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
  }, [value])
  return <div ref={ref}>{children}</div>
}

/**
 * A board column: the stage's count block and name as the heading, the cards under it. The name comes
 * first in the DOM ("Saved 2" to assistive tech) and the block first on screen. On a phone the stage
 * switcher names the column.
 */
function Column({
  stage,
  title,
  count,
  compact,
  children,
}: {
  stage: Stage
  title: string
  /** 'pending' holds the count block's place while the board loads. */
  count?: number | 'pending'
  compact: boolean
  children: ReactNode
}) {
  if (compact) return <section aria-label={title}>{children}</section>
  return (
    <Section
      headingLevel={2}
      className="camp-col"
      title={
        <span className="camp-col__title">
          {title}
          {typeof count === 'number' ? ' ' : null}
          {count === 'pending' ? <Skeleton variant="block" width={40} height={40} /> : null}
          {typeof count === 'number' ? <StageMark stage={stage} variant="count" count={count} /> : null}
        </span>
      }
      rule={false}
    >
      {children}
    </Section>
  )
}

/** The first-run board: one lemon card with the ways in. */
function FirstJob({ onAdd }: { onAdd: () => void }) {
  return (
    <Sticker tone="lemon" className="camp-first">
      <div>
        <h2 className="camp-first__title">Add your first job</h2>
        <p className="camp-first__lead">
          No applications yet. Each one you add gets its own page to prepare, track and apply from.
        </p>
      </div>
      <div className="camp-first__actions">
        <Button asChild>
          <Link to="/discovery"><Briefcase aria-hidden="true" /> Find a job in Discover</Link>
        </Button>
        <Button variant="secondary" onClick={onAdd}>
          <Plus aria-hidden="true" /> Add a job by hand
        </Button>
      </div>
    </Sticker>
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
  const urgent = cardUrgency(card)
  return (
    <Card aria-busy={moving || undefined}>
      <CardHeader>
        <CardTitle headingLevel={compact ? 2 : 3} asChild>
          <Link to="/campaigns/$campaignId" params={{ campaignId: card.id }}>{title}</Link>
        </CardTitle>
        {card.is_pinned ? <Pin className="camp-pin" size={12} fill="currentColor" aria-label="Pinned" role="img" /> : null}
        <CardActions placement="overlay">
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
      {urgent || showStatus || ready || questions > 0 ? (
        <Cluster gap={1} className="camp-card__badges">
          {/* Rose is time pressure: a date within a week, or already past. */}
          {urgent ? <Badge size="sm" tone="rose">{urgent.text}</Badge> : null}
          {showStatus ? (
            <Badge size="sm" tone={card.status === 'no_reply' ? 'lilac' : 'stone'}>{STATUS_LABELS[card.status]}</Badge>
          ) : null}
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

/** What the list's Next step column says for a card: its task and date, else what waits on the owner. */
function nextText(card: ApplicationCard): string | null {
  const parts = nextParts(card)
  if (parts.length) return parts.join(' · ').replace(/^Next: /, '')
  if (card.status === 'saved' && card.open_question_count > 0) {
    return `${card.open_question_count} ${card.open_question_count === 1 ? 'question' : 'questions'} to answer`
  }
  if (card.status === 'saved' && card.ready) return 'Ready to apply'
  if (card.no_reply_suggested) return 'No reply yet?'
  return null
}

const SORTERS: Record<string, (a: ApplicationCard, b: ApplicationCard) => number> = {
  role: (a, b) => roleOnly(applicationTitle(a), a.company).localeCompare(roleOnly(applicationTitle(b), b.company)),
  company: (a, b) => (a.company ?? '').localeCompare(b.company ?? ''),
  fit: (a, b) => (a.match_score ?? -1) - (b.match_score ?? -1),
  next: (a, b) => urgencySortKey(a) - urgencySortKey(b),
  activity: (a, b) =>
    new Date(a.last_activity_at ?? a.updated_at).getTime() - new Date(b.last_activity_at ?? b.updated_at).getTime(),
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
  // The list opens answering "what do I do next": soonest date first, closed last.
  const [sort, setSort] = useState<TableSort>({ id: 'next', direction: 'asc' })
  const order = (card: ApplicationCard) => STATUSES.indexOf(card.status)
  const compare = SORTERS[sort.id] ?? SORTERS.next
  const rows = [...items]
    .sort((a, b) => order(a) - order(b))
    .sort((a, b) => (sort.direction === 'asc' ? compare(a, b) : compare(b, a)))
  const columns: TableColumn<ApplicationCard>[] = [
    {
      id: 'role',
      header: 'Role',
      primary: true,
      sortable: true,
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
    { id: 'company', header: 'Company', sortable: true, cell: (card) => <span className="camp-wrap">{card.company ?? '–'}</span> },
    {
      id: 'fit',
      header: 'Skills fit',
      sortable: true,
      cell: (card) => (card.match_score !== null ? <FitStamp value={card.match_score} size="sm" /> : '–'),
    },
    {
      id: 'next',
      header: 'Next step',
      sortable: true,
      cell: (card) => {
        const urgent = cardUrgency(card)
        const text = nextText(card)
        return (
          <span className="camp-next">
            <span className="camp-wrap">{text ?? '–'}</span>
            {urgent ? <Badge size="sm" tone="rose">{urgent.text}</Badge> : null}
          </span>
        )
      },
    },
    { id: 'activity', header: 'Last activity', sortable: true, cell: (card) => timeAgo(card.last_activity_at ?? card.updated_at) },
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
              <StageMark stage={stageOf(card.status)} label={STATUS_LABELS[card.status]} />
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
      sort={sort}
      onSortChange={setSort}
      getRowProps={(card) => ({ 'aria-busy': moving(card) || undefined })}
    />
  )
}
