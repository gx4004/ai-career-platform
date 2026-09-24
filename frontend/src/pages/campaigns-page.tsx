import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRightLeft, CalendarClock, Compass, SearchX, SquareKanban } from 'lucide-react'
import {
  StatusPill,
  WorkspaceEmpty,
  WorkspaceHero,
  WorkspacePage,
} from '#/components/app/WorkspacePage'
import { StageMenu } from '#/components/campaigns/StageMenu'
import {
  STAGES,
  campaignCompany,
  campaignTitle,
  formatDate,
  stageOf,
  statusLabel,
  stageTone,
  timeAgo,
} from '#/components/campaigns/stages'
import { Button } from '#/components/ui/button'
import { getHistoryWorkspaces, updateHistoryWorkspace } from '#/lib/api/client'
import type { CampaignStatus, WorkspaceList } from '#/lib/api/schemas'
import { isR14DiscoveryEnabled } from '#/lib/flags/featureFlags'

type Campaign = WorkspaceList['items'][number]
const QUERY_KEY = ['history-workspaces']

export function CampaignsPage() {
  const queryClient = useQueryClient()
  const [moveError, setMoveError] = useState<string | null>(null)
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: getHistoryWorkspaces })
  const move = useMutation({
    mutationFn: ({ campaign, status }: { campaign: Campaign; status: CampaignStatus }) =>
      updateHistoryWorkspace(campaign.id, { status }),
    onMutate: () => setMoveError(null),
    onSuccess: (updated) => {
      // The PATCH reply has no next task, so patch the status into the cached card.
      queryClient.setQueryData<WorkspaceList>(QUERY_KEY, (current) =>
        current && {
          ...current,
          items: current.items.map((item) =>
            item.id === updated.id ? { ...item, status: updated.status, updated_at: updated.updated_at } : item,
          ),
        },
      )
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
    onError: (_error, { campaign }) =>
      setMoveError(`“${campaignTitle(campaign)}” couldn't be moved. Refresh the page and try again.`),
  })

  // Every tool run gets a workspace; only the ones aimed at a job belong on the board.
  const items = (query.data?.items ?? []).filter(
    (item) => item.role || item.company || item.listing || item.status || item.deadline,
  )
  const byStage = (stage: string) => items.filter((item) => stageOf(item.status) === stage)
  const findJobs = isR14DiscoveryEnabled()
    ? <Button asChild><Link to="/discovery"><Compass size={16} /> Find jobs</Link></Button>
    : <Button asChild><Link to="/job-match">Match a job</Link></Button>

  return (
    <WorkspacePage wide className="camp-page">
      <WorkspaceHero
        icon={SquareKanban}
        eyebrow="Applications"
        title="Your applications"
        subtitle="Every job you're going for, from saved to offer. Open one to keep its documents, tasks and notes together."
        actions={findJobs}
        stats={query.data ? [
          { label: 'In progress', value: items.filter((item) => stageOf(item.status) !== 'closed').length },
          { label: 'Applied', value: byStage('applied').length },
          { label: 'Interviewing', value: byStage('interviewing').length },
          { label: 'Offers', value: byStage('offer').length },
        ] : undefined}
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
          icon={SquareKanban}
          title="No applications yet"
          description="Save a job you like and it shows up here, ready to track from first draft to offer."
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
                    {cards.map((campaign) => (
                      <li key={campaign.id}>
                        <CampaignCard
                          campaign={campaign}
                          moving={move.isPending && move.variables?.campaign.id === campaign.id}
                          onMove={(status) => move.mutate({ campaign, status })}
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
    </WorkspacePage>
  )
}

function CampaignCard({
  campaign,
  moving,
  onMove,
}: {
  campaign: Campaign
  moving: boolean
  onMove: (status: CampaignStatus) => void
}) {
  const title = campaignTitle(campaign)
  const company = campaignCompany(campaign)
  const stageLabel = STAGES.find((stage) => stage.id === stageOf(campaign.status))?.label
  const label = statusLabel(campaign.status)
  const task = campaign.next_task
  return (
    <article className="camp-card" aria-busy={moving || undefined}>
      <div className="camp-card__top">
        <div className="camp-card__title">
          <Link to="/campaigns/$campaignId" params={{ campaignId: campaign.id }} className="camp-card__link">
            {title}
          </Link>
          {company ? <span>{company}</span> : null}
        </div>
        <StageMenu status={campaign.status} onMove={onMove} disabled={moving}>
          <button type="button" className="camp-card__move" aria-label={`Move ${title}`}>
            <ArrowRightLeft size={15} aria-hidden="true" />
          </button>
        </StageMenu>
      </div>
      {label !== stageLabel ? <StatusPill tone={stageTone(campaign.status)}>{label}</StatusPill> : null}
      {task ? (
        <p className="camp-card__next">
          <CalendarClock size={14} aria-hidden="true" />
          <span>
            <strong>Next:</strong> {task.title}
            {task.deadline ? <em> · due {formatDate(task.deadline)}</em> : null}
          </span>
        </p>
      ) : campaign.deadline ? (
        <p className="camp-card__next">
          <CalendarClock size={14} aria-hidden="true" />
          <span>Apply by {formatDate(campaign.deadline)}</span>
        </p>
      ) : null}
      <p className="camp-card__meta">Last activity {timeAgo(campaign.last_activity_at ?? campaign.updated_at)}</p>
    </article>
  )
}
