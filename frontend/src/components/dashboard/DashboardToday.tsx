import { useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useIsFetching, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
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
} from '#/components/kit'
import { useBreakpoint } from '#/hooks/use-breakpoint'
import { DateStamp } from '#/components/dashboard/DateStamp'
import { useDashboardLayoutHint, type TodayOrder } from '#/components/dashboard/dashboardLayoutHint'
import { formatRunDate } from '#/components/dashboard/RunRow'
import { TODAY_QUERY_KEY, useToday } from '#/hooks/useToday'
import { adoptDiscoveryRecommendation, getApplication } from '#/lib/api/client'
import type { DiscoveryListing, TodayActionItem, TodayPlan } from '#/lib/api/schemas'
import { invalidateApplications } from '#/lib/query/applicationCaches'
import { writeWorkflowContext } from '#/lib/tools/drafts'
import { useAddToApplicationsToast } from '#/components/discovery/useAddToApplications'

type TodayProps = {
  /** The page shows "Your first 3 steps" above: its step 3 already offers Discover jobs, so this one does not. */
  firstSteps?: boolean
  /** The user has a resume in (a Resume Analyzer run or a CV): decides what an empty match list asks for. */
  hasResume?: boolean
  /** The account has no applications (known before the plan): nothing can need action, so matches come first. */
  noApplications?: boolean
}

/** The empty Needs action ("Nothing needs you today"), measured on the dashboard, for its loading frame. */
const NEEDS_EMPTY_HEIGHT = 173

/**
 * "What should I do today?": applications that need a move, and jobs worth adding. Whichever has
 * something to do comes first; two Sections the page places in its main column.
 */
export function DashboardToday({ firstSteps = false, hasResume = true, noApplications = false }: TodayProps = {}) {
  const today = useToday()
  const plan = today.data
  const layout = useDashboardLayoutHint()

  // The loaded shapes, in the order they will most likely land, so nothing jumps or swaps when they arrive.
  if (today.isPending) return <DashboardTodaySkeleton order={noApplications ? 'matches-first' : (layout?.order ?? 'needs-first')} />

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

  const matches = <BestMatches plan={plan} firstSteps={firstSteps} hasResume={hasResume} />
  return plan.needs_action.length > 0 ? (
    <>
      <NeedsAction plan={plan} />
      {matches}
    </>
  ) : (
    <>
      {matches}
      <NeedsAction plan={plan} />
    </>
  )
}

/**
 * Both sections while the plan loads, in the frames and the order they will have. needs-first (the default): two
 * sticker plates, then five match rows. matches-first (nothing needs action: an account without applications, or the
 * order the last plan in this browser used): the match rows, then the empty Needs action's frame.
 */
export function DashboardTodaySkeleton({ order = 'needs-first' }: { order?: TodayOrder } = {}) {
  const matches = (
    <Section title="Best matches to add">
      <List aria-busy aria-label="Best matches to add">
        <Skeleton variant="row" as="li" leading="stamp" count={5} />
      </List>
    </Section>
  )
  if (order === 'matches-first') {
    return (
      <>
        {matches}
        <Section title="Needs action">
          <Skeleton variant="block" height={NEEDS_EMPTY_HEIGHT} label="Loading what needs you" />
        </Section>
      </>
    )
  }
  return (
    <>
      <Section title="Needs action">
        {/* 134: a desktop Needs action sticker is 130px, and .dash-actions leaves 2px above and 6px below for the
            plates' tilt and shadow, so the matches below do not jump when the plan arrives. */}
        <Skeleton variant="sticker" count={2} height={134} label="Loading what needs you" />
      </Section>
      {matches}
    </>
  )
}

/**
 * One toast for the adds on this page: a run of adds replaces it rather than stacking one per add (three toasts
 * covered the next rows' Add buttons on a phone), and its Undo is always for the latest add.
 */
const ADD_TOAST_ID = 'dashboard-added'

/**
 * Focus a control the page hands focus to, without the browser's own jump, then scroll it only as far as needed:
 * that scroll honours the root's scroll padding, which kit/toast.css keeps clear of the toast stack, so the focus
 * ring never sits under the toast this very add or undo opened (WCAG 2.4.11).
 */
function focusInView(element: HTMLElement) {
  element.focus({ preventScroll: true })
  element.scrollIntoView?.({ block: 'nearest' })
}

type ListName = 'best_matches' | 'closest_matches'

/** Put a listing back in the cached plan, at the place it left (unless the plan already has it again). */
function restoreListing(queryClient: QueryClient, listing: DiscoveryListing, list: ListName, index: number) {
  queryClient.setQueryData<TodayPlan>(TODAY_QUERY_KEY, (current) => {
    if (!current || current[list].some((item) => item.listing_id === listing.listing_id)) return current
    const next = [...current[list]]
    next.splice(Math.min(index, next.length), 0, listing)
    return { ...current, [list]: next }
  })
}

function BestMatches({ plan, firstSteps, hasResume }: { plan: TodayPlan; firstSteps: boolean; hasResume: boolean }) {
  const queryClient = useQueryClient()
  const announceAdded = useAddToApplicationsToast(ADD_TOAST_ID)
  const sectionRef = useRef<HTMLElement | null>(null)
  // The row whose Add was used leaves the list: it and its place in the list, to hand focus on once it is gone.
  // `settled`: the plan's refetch after that Add has finished, so an empty list is final.
  const refocusAt = useRef<{ index: number; listingId: string; settled?: boolean } | null>(null)
  // Bumped when that refetch finishes: it can bring nothing new to render, yet the focus hand-off must run again.
  const [planSettled, setPlanSettled] = useState(0)
  // The row an Undo put back: its Add takes focus from the closed toast once the row is in the list again.
  const refocusListing = useRef<string | null>(null)
  // Adding refetches the plan, which can bring a different list (the closest matches once no best one is left).
  const refreshing = useIsFetching({ queryKey: TODAY_QUERY_KEY, exact: true }) > 0
  // One request at a time: the mutation state lags a render behind a double click, so the guard is a ref.
  const adding = useRef(false)
  const adopt = useMutation({
    mutationFn: (listingId: string) => adoptDiscoveryRecommendation(listingId),
    retry: false,
    // Stay here so several matches can be added in a row: the row leaves the list at once, a toast offers the application.
    onSuccess: ({ application, created }, listingId) => {
      // Focus was on that Add (or fell to the page while it was busy): it moves on to the next row's Add, so a
      // keyboard user is not sent back to the top of the page. Focus somewhere else is left alone.
      const section = sectionRef.current
      const active = document.activeElement
      if (section && (!active || active === document.body || section.contains(active))) {
        const buttons = [...section.querySelectorAll<HTMLElement>('[data-add-listing]')]
        const index = buttons.findIndex((button) => button.dataset.addListing === listingId)
        refocusAt.current = { index: index < 0 ? 0 : index, listingId }
      }
      const before = queryClient.getQueryData<TodayPlan>(TODAY_QUERY_KEY)
      const place = (['best_matches', 'closest_matches'] as const)
        .map((list) => ({ list, index: before?.[list].findIndex((item) => item.listing_id === listingId) ?? -1 }))
        .find((found) => found.index >= 0)
      const removed = place && before ? before[place.list][place.index] : undefined
      queryClient.setQueryData<TodayPlan>(TODAY_QUERY_KEY, (current) =>
        current
          ? {
              ...current,
              best_matches: current.best_matches.filter((listing) => listing.listing_id !== listingId),
              closest_matches: current.closest_matches.filter((listing) => listing.listing_id !== listingId),
            }
          : current,
      )
      void invalidateApplications(queryClient).finally(() => {
        if (refocusAt.current?.listingId === listingId) {
          refocusAt.current = { ...refocusAt.current, settled: true }
          setPlanSettled((count) => count + 1)
        }
      })
      announceAdded(application, {
        created,
        onUndone: () => {
          if (removed && place) {
            refocusListing.current = removed.listing_id
            restoreListing(queryClient, removed, place.list, place.index)
          }
        },
      })
    },
  })

  // The server only calls a listing "best" at or above its fit floor; when none clears it, it sends the
  // closest ones separately, and they are shown under an honest title rather than as best.
  const closest = plan.best_matches.length === 0 && plan.closest_matches.length > 0
  const shown = closest ? plan.closest_matches : plan.best_matches
  const title = closest ? 'Closest matches to add' : 'Best matches to add'

  useLayoutEffect(() => {
    const section = sectionRef.current
    if (!section) return
    const active = document.activeElement
    // Focus is free to move when it fell to the page (its button left) or sits in the section or a toast.
    const free = !active || active === document.body || section.contains(active) || Boolean(active.closest('.kit-toast'))

    const restored = refocusListing.current
    if (restored !== null) {
      const button = [...section.querySelectorAll<HTMLElement>('[data-add-listing]')].find(
        (candidate) => candidate.dataset.addListing === restored,
      )
      if (button) {
        refocusListing.current = null
        // The undone row is back: nothing is waiting for it to leave any more.
        if (refocusAt.current?.listingId === restored) refocusAt.current = null
        if (free) focusInView(button)
      } else if (!refreshing) {
        refocusListing.current = null
      }
    }

    const pending = refocusAt.current
    if (pending === null) return
    if (!free) {
      refocusAt.current = null
      return
    }
    const buttons = [...section.querySelectorAll<HTMLElement>('[data-add-listing]')]
    // Not yet: the plan can start refetching a render before the added row leaves.
    if (buttons.some((button) => button.dataset.addListing === pending.listingId)) return
    const index = pending.index
    if (buttons.length > 0) {
      // The next row moved up into the place; after the last row, the one before it.
      refocusAt.current = null
      focusInView(buttons[Math.min(index, buttons.length - 1)])
      return
    }
    // The refetch promise settles before its data reaches this render: final only once the plan shown is the cache's.
    if (!pending.settled || queryClient.getQueryData(TODAY_QUERY_KEY) !== plan) {
      // None left, but the refetched plan may bring rows (the closest matches once no best one is left), and its
      // fetch can start a render after the list emptied: hold focus on the section, which stays (the empty state's
      // action leaves when rows arrive), and hand it to the first new row's Add when they do.
      refocusAt.current = { ...pending, index: 0 }
      if (document.activeElement !== section) focusInView(section)
      return
    }
    // The refetched plan has none either: the empty state's action, or the section itself.
    refocusAt.current = null
    focusInView(section.querySelector<HTMLElement>('.kit-empty a, .kit-empty button') ?? section)
  }, [plan, shown, refreshing, planSettled, queryClient])

  return (
    <Section
      ref={sectionRef}
      tabIndex={-1}
      className="dash-matches"
      title={title}
      count={shown.length > 0 ? shown.length : undefined}
      actions={
        // A newcomer's step 3 already says Discover jobs: one way there on the screen, not two.
        firstSteps ? null : (
          <Button asChild variant="secondary" size="sm">
            <Link to="/discovery">Discover jobs</Link>
          </Button>
        )
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
        <MatchesEmpty plan={plan} firstSteps={firstSteps} hasResume={hasResume} />
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
          data-add-listing={listing.listing_id}
          aria-label={`Add ${listing.title} to applications`}
        >
          <Plus aria-hidden />
          Add
        </Button>
      </RowActions>
    </Row>
  )
}

function MatchesEmpty({ plan, firstSteps, hasResume }: { plan: TodayPlan; firstSteps: boolean; hasResume: boolean }) {
  if (!plan.has_sources) {
    return (
      <EmptyState
        icon={<Compass aria-hidden />}
        title="No job boards yet"
        description="Once employer job boards are connected, the openings that fit you best show up here."
        action={
          <Button asChild variant="secondary">
            <Link to="/discovery">Open Discover</Link>
          </Button>
        }
      />
    )
  }
  if (!plan.has_evidence) {
    // Before the resume is in, the first step above is the one move: this box only says what comes after it.
    if (!hasResume) {
      return (
        <EmptyState
          icon={<Compass aria-hidden />}
          title="Matches appear after your resume"
          description={
            firstSteps
              ? 'Once your resume is in and your skills are in your profile, the jobs that fit you best appear here.'
              : 'Add your resume, then your skills, and the jobs that fit you best appear here.'
          }
        />
      )
    }
    // Matches are scored against the skills saved in the profile (not the resume itself): ask for those.
    return (
      <EmptyState
        icon={<Compass aria-hidden />}
        title="Add your skills to see matches"
        description="Jobs are matched against the skills saved in your profile. Add a few and the best fits appear here."
        action={
          <Button asChild variant="secondary">
            <Link to="/profile" search={{ add: 'fact' }}>
              Add skills
            </Link>
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
        <Button asChild variant="secondary">
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
        // Both came from the application, not from whichever tool ran last.
        jobOrigin: listing && description ? 'application' : undefined,
        roleOrigin: 'application',
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
        // Only when there is something to see: an empty list would lead to another empty page.
        plan.needs_action_total > 0 ? (
          <Button asChild variant="link" size="sm">
            <Link to="/campaigns">View all</Link>
          </Button>
        ) : null
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
