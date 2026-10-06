import { useRef, useState, type MouseEvent } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Clock, Compass, Plus } from 'lucide-react'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  FitStamp,
  List,
  MetaRow,
  Notice,
  Row,
  RowActions,
  RowBody,
  RowLeading,
  RowMeta,
  RowSubtitle,
  RowTitle,
  Section,
  Skeleton,
  SkillPips,
  Sticker,
  StretchedLink,
  type Tone,
  useToast,
} from '#/components/kit'
import { useBreakpoint } from '#/hooks/use-breakpoint'
import { DateStamp } from '#/components/dashboard/DateStamp'
import { formatRunDate } from '#/components/dashboard/RunRow'
import { TODAY_QUERY_KEY, useToday } from '#/hooks/useToday'
import { adoptDiscoveryRecommendation, getApplication } from '#/lib/api/client'
import type { DiscoveryListing, TodayActionItem, TodayPlan } from '#/lib/api/schemas'
import { invalidateApplications } from '#/lib/query/applicationCaches'
import { writeWorkflowContext } from '#/lib/tools/drafts'

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
          icon={<AlertTriangle aria-hidden />}
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
  const { toast } = useToast()
  // One request at a time: the mutation state lags a render behind a double click, so the guard is a ref.
  const adding = useRef(false)
  const adopt = useMutation({
    mutationFn: (listingId: string) => adoptDiscoveryRecommendation(listingId),
    retry: false,
    // Stay here so several matches can be added in a row: the row leaves the list at once, a toast offers the application.
    onSuccess: (application, listingId) => {
      queryClient.setQueryData<TodayPlan>(TODAY_QUERY_KEY, (current) =>
        current
          ? {
              ...current,
              best_matches: current.best_matches.filter((listing) => listing.listing_id !== listingId),
              closest_matches: current.closest_matches.filter((listing) => listing.listing_id !== listingId),
            }
          : current,
      )
      void invalidateApplications(queryClient)
      toast({
        tone: 'success',
        title: 'Added to your applications',
        description: application.title ?? undefined,
        action: {
          label: 'View application',
          onClick: () => navigate({ to: '/campaigns/$campaignId', params: { campaignId: application.id } }),
        },
      })
    },
  })

  // The server only calls a listing "best" at or above its fit floor; when none clears it, it sends the
  // closest ones separately, and they are shown under an honest title rather than as best.
  const closest = plan.best_matches.length === 0 && plan.closest_matches.length > 0
  const shown = closest ? plan.closest_matches : plan.best_matches
  const title = closest ? 'Closest matches to add' : 'Best matches to add'

  return (
    <Section
      title={title}
      count={shown.length > 0 ? shown.length : undefined}
      actions={
        <Button asChild variant="secondary" size="sm">
          <Link to="/discovery">Discover jobs</Link>
        </Button>
      }
    >
      {shown.length > 0 ? (
        <>
          <List aria-label={title}>
            {shown.map((listing) => (
              <MatchRow
                key={listing.listing_id}
                listing={listing}
                adding={adopt.isPending && adopt.variables === listing.listing_id}
                onAdd={() => {
                  if (adding.current) return
                  adding.current = true
                  adopt.mutate(listing.listing_id, { onSettled: () => { adding.current = false } })
                }}
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
  const matched = listing.matched_skills.length
  const total = matched + listing.missing_skills.length
  // A fit that rests on few listed skills is held down on purpose (2 of 2 can read 50%): say what it rests on.
  const fewListed = listing.fit_confidence === 'low'
  const sample = fewListed
    ? `${total} ${total === 1 ? 'skill' : 'skills'} listed`
    : `${matched} of ${total} ${total === 1 ? 'skill' : 'skills'}`
  const isMobile = useBreakpoint() === 'mobile'
  return (
    <Row className="dash-match">
      <RowLeading>
        <FitStamp value={fit} size={isMobile ? 'sm' : 'md'} />
      </RowLeading>
      <RowBody>
        <RowTitle size="lg" headingLevel={3} asChild>
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
          </MetaRow>
        </RowSubtitle>
      </RowBody>
      {total > 0 ? (
        <RowMeta>
          <span className="dash-skills" title={fewListed ? 'The posting names few skills, so read this fit as a rough guide.' : undefined}>
            <span>
              {sample}
              {fewListed ? <span className="kit-sr-only">{`, ${matched} matched`}</span> : null}
            </span>
            <SkillPips matched={matched} total={total} aria-hidden="true" />
          </span>
        </RowMeta>
      ) : null}
      <RowActions reveal={false}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onAdd}
          loading={adding}
          aria-label={`Add ${listing.title} to applications`}
        >
          <Plus aria-hidden />
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
        icon={<Compass aria-hidden />}
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
        icon={<Compass aria-hidden />}
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
      icon={<Compass aria-hidden />}
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

/** Colour by meaning: Interviewing is the stage's tangerine, a deadline is time pressure (rose), waiting is lilac. */
const ACTION_TONE: Record<TodayActionItem['reason'], Tone> = {
  interview: 'tangerine',
  deadline: 'rose',
  no_reply: 'lilac',
}

function reasonText(item: TodayActionItem): string {
  if (item.reason === 'interview') return 'Interviewing: prepare for the next round'
  if (item.reason === 'deadline') return 'Deadline'
  const days = item.days_since_applied ?? 0
  return `No reply yet? Applied ${days} ${days === 1 ? 'day' : 'days'} ago`
}

/**
 * "Prep for the round" carries the application into Interview Q&A the way every tool hand-off does (the tab's
 * workflow context): its role, the saved job description when it has one, and the application itself, so the
 * run is filed under it. A plain link otherwise (new tab, or the fetch failing, still opens the tool).
 */
function usePrepForRound(item: TodayActionItem) {
  const navigate = useNavigate()
  return async (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    const application = await getApplication(item.application_id).catch(() => null)
    const listing = application?.listing
    try {
      // The context merges, so every job field is written for this application: an earlier job's description,
      // label, source or run must not ride along when this application has no saved listing description.
      const description = listing?.description?.trim()
      writeWorkflowContext({
        targetRole: item.title,
        jobDescription: listing && description ? `${listing.title} at ${listing.company}\n\n${description}` : undefined,
        jobLabel: undefined,
        jobSource: undefined,
        historyId: undefined,
        // Another job's Job Match result would otherwise seed this interview run (job_match handoff).
        jobMatch: undefined,
        workspaceId: item.application_id,
        workspaceLabel: application?.label ?? item.title,
        updatedAt: Date.now(),
      })
    } catch {
      /* storage unavailable: the form asks for what is missing */
    }
    void navigate({ to: '/interview' })
  }
}

/** One thing that needs the user, as a sticker: what it is, which application, and the one move. */
function ActionSticker({ item, now }: { item: TodayActionItem; now: Date }) {
  const prepForRound = usePrepForRound(item)
  const deadline = item.reason === 'deadline' && item.deadline ? new Date(item.deadline) : null
  return (
    <Sticker as="li" tone={ACTION_TONE[item.reason]} className="dash-act">
      <div className="dash-act__main">
        <Badge tone="white" dot={item.reason !== 'deadline'}>
          {item.reason === 'deadline' ? <Clock aria-hidden className="dash-act__icon" /> : null}
          {item.reason === 'interview' ? 'Interviewing' : item.reason === 'deadline' ? 'Deadline' : 'No reply'}
        </Badge>
        <h3 className="dash-act__title">
          <StretchedLink asChild>
            <Link to="/campaigns/$campaignId" params={{ campaignId: item.application_id }}>
              {item.title}
            </Link>
          </StretchedLink>
        </h3>
        {item.company ? <p className="dash-act__company" title={item.company}>{item.company}</p> : null}
      </div>
      <div className="dash-act__side">
        {deadline && !Number.isNaN(deadline.getTime()) ? (
          <DateStamp date={deadline} now={now} />
        ) : item.reason === 'interview' ? (
          <>
            <p className="dash-act__todo">Prepare for the next round</p>
            <Button asChild variant="secondary" size="sm">
              <Link to="/interview" onClick={(event) => void prepForRound(event)}>
                Prep for the round
              </Link>
            </Button>
          </>
        ) : (
          <>
            <p className="dash-act__todo">
              {reasonText(item)}
            </p>
            <Button asChild variant="secondary" size="sm">
              <Link to="/campaigns/$campaignId" params={{ campaignId: item.application_id }}>
                Open application
              </Link>
            </Button>
          </>
        )}
      </div>
    </Sticker>
  )
}

/** The most that are drawn as stickers; the rest become rows (equal-height stickers need a short list). */
const STICKER_LIMIT = 2

function NeedsAction({ plan }: { plan: TodayPlan }) {
  const [now] = useState(() => new Date())
  const stickers = plan.needs_action.slice(0, STICKER_LIMIT)
  const more = plan.needs_action.slice(STICKER_LIMIT)
  const hidden = plan.needs_action_total - plan.needs_action.length
  return (
    <Section
      title="Needs action"
      count={plan.needs_action_total > 0 ? plan.needs_action_total : undefined}
      countTone="rose"
      actions={
        <Button asChild variant="link" size="sm">
          <Link to="/campaigns">View all</Link>
        </Button>
      }
    >
      {plan.needs_action.length > 0 ? (
        <div className="dash-needs">
          <ul className="dash-actions" aria-label="Needs action">
            {stickers.map((item) => (
              <ActionSticker key={item.application_id} item={item} now={now} />
            ))}
          </ul>
          {more.length > 0 || hidden > 0 ? (
            <List aria-label="More that need action">
              {more.map((item) => (
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
          ) : null}
        </div>
      ) : (
        <EmptyState
          icon={<Check aria-hidden />}
          title="Nothing needs you today"
          description="Interviews, close deadlines and applications waiting 21 days without a reply show up here."
        />
      )}
    </Section>
  )
}
