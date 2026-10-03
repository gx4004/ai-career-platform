import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  EmptyState,
  ErrorState,
  List,
  MetaRow,
  Notice,
  Row,
  RowActions,
  RowBody,
  RowMeta,
  RowSubtitle,
  RowTitle,
  ScoreBar,
  Section,
  Skeleton,
} from '#/components/kit'
import { formatRunDate } from '#/components/dashboard/RunRow'
import { useToday } from '#/hooks/useToday'
import { adoptDiscoveryRecommendation } from '#/lib/api/client'
import type { DiscoveryListing, TodayActionItem, TodayPlan } from '#/lib/api/schemas'
import { invalidateApplications } from '#/lib/query/applicationCaches'

/**
 * "What should I do today?": applications that need a move, and jobs worth adding. Whichever has
 * something to do comes first; two Sections the page places in its main column.
 */
export function DashboardToday() {
  const today = useToday()
  const plan = today.data

  if (today.isPending) {
    return (
      <>
        <Section title="Needs action">
          <List aria-busy aria-label="Needs action">
            <Skeleton variant="row" as="li" count={2} />
          </List>
        </Section>
        <Section title="Best matches to add">
          <List aria-busy aria-label="Best matches to add">
            <Skeleton variant="row" as="li" count={5} />
          </List>
        </Section>
      </>
    )
  }

  if (!plan) {
    return (
      <Section title="Needs action and best matches">
        <ErrorState
          headingLevel={3}
          title="Your matches and next steps couldn't be loaded"
          onRetry={() => void today.refetch()}
          retrying={today.isFetching}
        />
      </Section>
    )
  }

  return plan.needs_action.length > 0 ? (
    <>
      <NeedsAction plan={plan} />
      <BestMatches plan={plan} />
    </>
  ) : (
    <>
      <BestMatches plan={plan} />
      <NeedsAction plan={plan} />
    </>
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
    <Section
      title="Best matches to add"
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link to="/discovery">Discover jobs</Link>
        </Button>
      }
    >
      {plan.best_matches.length > 0 ? (
        <>
          <List aria-label="Best matches to add">
            {plan.best_matches.map((listing) => (
              <MatchRow
                key={listing.listing_id}
                listing={listing}
                adding={adopt.isPending && adopt.variables === listing.listing_id}
                onAdd={() => adopt.mutate(listing.listing_id)}
              />
            ))}
          </List>
          {adopt.isError ? (
            <Notice tone="danger" className="dash-notice">
              That job could not be added. Try again.
            </Notice>
          ) : null}
        </>
      ) : (
        <MatchesEmpty plan={plan} />
      )}
    </Section>
  )
}

function MatchRow({ listing, adding, onAdd }: { listing: DiscoveryListing; adding: boolean; onAdd: () => void }) {
  const fit = listing.skills_fit
  const total = listing.matched_skills.length + listing.missing_skills.length
  const sample = `${listing.matched_skills.length} of ${total} ${total === 1 ? 'skill' : 'skills'}`
  return (
    <Row>
      <RowBody>
        <RowTitle headingLevel={3} asChild>
          <a href={listing.source_url} target="_blank" rel="noopener noreferrer">
            {listing.title}
            <span className="kit-sr-only"> (opens the listing on {listing.source_name})</span>
          </a>
        </RowTitle>
        <RowSubtitle>
          <MetaRow>
            <strong>{listing.company}</strong>
            {listing.location}
            {listing.remote && !/remote/i.test(listing.location ?? '') ? 'Remote' : null}
            {fit !== null && total > 0 ? sample : null}
          </MetaRow>
        </RowSubtitle>
      </RowBody>
      {fit === null ? null : (
        <RowMeta>
          <ScoreBar
            aria-label={`${fit}% skills fit, ${sample}`}
            layout="inline"
            size="sm"
            value={fit}
            valueLabel={`${fit}% fit`}
            valueWidth="3.5rem"
            lowTone="neutral"
          />
        </RowMeta>
      )}
      <RowActions reveal={false}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onAdd}
          loading={adding}
          aria-label={`Add ${listing.title} to applications`}
        >
          Add
        </Button>
      </RowActions>
    </Row>
  )
}

function MatchesEmpty({ plan }: { plan: TodayPlan }) {
  if (!plan.has_sources) {
    return (
      <EmptyState
        title="No job boards yet"
        description="Once employer job boards are connected, the openings that fit you best show up here."
        action={
          <Button asChild variant="secondary" size="sm">
            <Link to="/discovery">Open Discover</Link>
          </Button>
        }
      />
    )
  }
  if (!plan.has_evidence) {
    return (
      <EmptyState
        title="Confirm your skills first"
        description="Once you confirm evidence in your profile, the jobs that fit your skills best appear here."
        action={
          <Button asChild variant="secondary" size="sm">
            <Link to="/profile">Confirm evidence</Link>
          </Button>
        }
      />
    )
  }
  return (
    <EmptyState
      title="You have seen every match"
      description="Every visible job is already in your applications or hidden. New openings appear daily."
      action={
        <Button asChild variant="secondary" size="sm">
          <Link to="/discovery">Browse all jobs</Link>
        </Button>
      }
    />
  )
}

function reasonText(item: TodayActionItem): string {
  if (item.reason === 'interview') return 'Interviewing: prepare for the next round'
  if (item.reason === 'deadline') return 'Deadline'
  const days = item.days_since_applied ?? 0
  return `No reply yet? Applied ${days} ${days === 1 ? 'day' : 'days'} ago`
}

function NeedsAction({ plan }: { plan: TodayPlan }) {
  const hidden = plan.needs_action_total - plan.needs_action.length
  return (
    <Section
      title="Needs action"
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link to="/campaigns">View all</Link>
        </Button>
      }
    >
      {plan.needs_action.length > 0 ? (
        <List aria-label="Needs action">
          {plan.needs_action.map((item) => (
            <Row key={item.application_id}>
              <RowBody>
                <RowTitle headingLevel={3} asChild>
                  <Link to="/campaigns/$campaignId" params={{ campaignId: item.application_id }}>
                    {item.title}
                  </Link>
                </RowTitle>
                <RowSubtitle>
                  <MetaRow>
                    {item.company ? <strong>{item.company}</strong> : null}
                    {reasonText(item)}
                  </MetaRow>
                </RowSubtitle>
              </RowBody>
              {item.reason === 'deadline' && item.deadline ? <RowMeta>{formatRunDate(item.deadline)}</RowMeta> : null}
            </Row>
          ))}
          {hidden > 0 ? (
            <Row>
              <RowBody>
                <RowTitle asChild>
                  <Link to="/campaigns">and {hidden} more in Applications</Link>
                </RowTitle>
              </RowBody>
            </Row>
          ) : null}
        </List>
      ) : (
        <EmptyState
          title="Nothing needs you today"
          description="Interviews, close deadlines and applications waiting 21 days without a reply show up here."
        />
      )}
    </Section>
  )
}
