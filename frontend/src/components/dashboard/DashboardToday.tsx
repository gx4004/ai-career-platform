import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, CalendarClock, FolderPlus, Hourglass, MessagesSquare } from 'lucide-react'
import type { ComponentType } from 'react'
import { CompanyAvatar, SkillsFit } from '#/components/discovery/JobParts'
import { Button } from '#/components/ui/button'
import { useToday } from '#/hooks/useToday'
import { adoptDiscoveryRecommendation } from '#/lib/api/client'
import type { DiscoveryListing, TodayActionItem, TodayPlan } from '#/lib/api/schemas'
import { invalidateApplications } from '#/lib/query/applicationCaches'

/** "What should I do today?": jobs worth adding, and applications that need a move. */
export function DashboardToday() {
  const today = useToday()
  const plan = today.data

  if (today.isPending) {
    return (
      <div className="today-grid" role="status" aria-label="Loading today">
        <div className="today-skeleton" />
        <div className="today-skeleton" />
      </div>
    )
  }
  if (!plan) return null

  return (
    <div className="today-grid" data-tour="today">
      <BestMatches plan={plan} />
      <NeedsAction plan={plan} />
    </div>
  )
}

function BestMatches({ plan }: { plan: TodayPlan }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const adopt = useMutation({
    mutationFn: (listingId: string) => adoptDiscoveryRecommendation(listingId),
    onSuccess: async (application) => {
      await invalidateApplications(queryClient)
      navigate({ to: '/campaigns/$campaignId', params: { campaignId: application.id } })
    },
  })

  return (
    <section className="dash-section" aria-labelledby="today-matches">
        <div className="dash-section__head">
          <h2 className="dash-section__title" id="today-matches">Best matches to add</h2>
          <Link to="/discovery" className="dash-section__link">Discover jobs</Link>
        </div>
        {plan.best_matches.length > 0 ? (
          <ol className="today-list">
            {plan.best_matches.map((listing) => (
              <li key={listing.listing_id}>
                <MatchRow
                  listing={listing}
                  adding={adopt.isPending && adopt.variables === listing.listing_id}
                  onAdd={() => adopt.mutate(listing.listing_id)}
                />
              </li>
            ))}
          </ol>
        ) : (
          <MatchesEmpty plan={plan} />
        )}
        {adopt.isError ? (
          <p className="today-error" role="alert">That job could not be added. Try again.</p>
        ) : null}
    </section>
  )
}

function MatchRow({ listing, adding, onAdd }: { listing: DiscoveryListing; adding: boolean; onAdd: () => void }) {
  return (
    <article className="today-match">
      <CompanyAvatar name={listing.company} />
      <div className="today-match__body">
        <h3 className="today-match__title">
          <a href={listing.source_url} target="_blank" rel="noopener noreferrer">
            {listing.title}
            <ArrowUpRight size={13} aria-hidden="true" />
            <span className="sr-only"> (opens the listing on {listing.source_name})</span>
          </a>
        </h3>
        <p className="today-match__meta">
          {listing.company}
          {listing.location ? ` · ${listing.location}` : ''}
          {listing.remote ? ' · Remote' : ''}
        </p>
      </div>
      <SkillsFit listing={listing} />
      <Button type="button" variant="outline" size="sm" onClick={onAdd} loading={adding} aria-label={`Add ${listing.title} to applications`}>
        <FolderPlus size={14} aria-hidden="true" /> Add
      </Button>
    </article>
  )
}

function MatchesEmpty({ plan }: { plan: TodayPlan }) {
  if (!plan.has_sources) {
    return (
      <EmptyBlock
        title="No job boards yet"
        description={<>Connect employer boards (<code>python -m app.scripts.seed_ats_sources</code>) and their openings show up here.</>}
        action={<Button asChild variant="outline" size="sm"><Link to="/discovery">Open Discover</Link></Button>}
      />
    )
  }
  if (!plan.has_evidence) {
    return (
      <EmptyBlock
        title="Confirm your skills first"
        description="Once you confirm evidence in your profile, the jobs that fit your skills best appear here."
        action={<Button asChild variant="outline" size="sm"><Link to="/profile">Confirm evidence</Link></Button>}
      />
    )
  }
  return (
    <EmptyBlock
      title="You have seen every match"
      description="Every visible job is already in your applications or hidden. New openings appear daily."
      action={<Button asChild variant="outline" size="sm"><Link to="/discovery">Browse all jobs</Link></Button>}
    />
  )
}

const REASONS: Record<TodayActionItem['reason'], { icon: ComponentType<{ size: number }>; tone: string }> = {
  interview: { icon: MessagesSquare, tone: 'warning' },
  deadline: { icon: CalendarClock, tone: 'accent' },
  no_reply: { icon: Hourglass, tone: 'neutral' },
}

function reasonText(item: TodayActionItem): string {
  if (item.reason === 'interview') return 'Interviewing: prepare for the next round'
  if (item.reason === 'deadline') {
    return `Deadline ${item.deadline ? new Date(item.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'soon'}`
  }
  const days = item.days_since_applied ?? 0
  return `No reply yet? Applied ${days} ${days === 1 ? 'day' : 'days'} ago`
}

function NeedsAction({ plan }: { plan: TodayPlan }) {
  const hidden = plan.needs_action_total - plan.needs_action.length
  return (
      <section className="dash-section" aria-labelledby="today-actions">
        <div className="dash-section__head">
          <h2 className="dash-section__title" id="today-actions">Needs action</h2>
          <Link to="/campaigns" className="dash-section__link">View all</Link>
        </div>
        {plan.needs_action.length > 0 ? (
          <>
            <ul className="today-list">
              {plan.needs_action.map((item) => {
                const { icon: Icon, tone } = REASONS[item.reason]
                return (
                  <li key={item.application_id}>
                    <Link
                      to="/campaigns/$campaignId"
                      params={{ campaignId: item.application_id }}
                      className={`today-action today-action--${tone}`}
                    >
                      <span className="today-action__icon" aria-hidden="true"><Icon size={14} /></span>
                      <span className="today-action__body">
                        <strong>{item.title}</strong>
                        <small>{item.company ? `${item.company} · ` : ''}{reasonText(item)}</small>
                      </span>
                      <ArrowUpRight size={13} className="today-action__go" aria-hidden="true" />
                    </Link>
                  </li>
                )
              })}
            </ul>
            {hidden > 0 ? (
              <p className="today-more">
                <Link to="/campaigns">and {hidden} more in Applications</Link>
              </p>
            ) : null}
          </>
        ) : (
          <EmptyBlock
            title="Nothing needs you today"
            description="Interviews, close deadlines and applications waiting 21 days without a reply show up here."
          />
        )}
      </section>
  )
}

function EmptyBlock({
  title,
  description,
  action,
}: {
  title: string
  description: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="today-empty">
      <p className="today-empty__title">{title}</p>
      <p className="today-empty__text">{description}</p>
      {action}
    </div>
  )
}
