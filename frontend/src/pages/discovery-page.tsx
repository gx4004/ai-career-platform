import { useEffect, useRef, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowUpRight, EyeOff, FileText, MoreHorizontal, Search } from 'lucide-react'
import {
  Badge,
  Button,
  Checkbox,
  Cluster,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  Input,
  KeyValue,
  KeyValueRow,
  List,
  MetaRow,
  Notice,
  Page,
  PageHeader,
  Pagination,
  Row,
  RowActions,
  RowBody,
  RowMeta,
  RowReveal,
  RowSubtitle,
  RowTitle,
  ScoreBar,
  Section,
  Select,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Stack,
  Toolbar,
  useToast,
} from '#/components/kit'
import {
  adoptDiscoveryRecommendation,
  dismissDiscoveryRecommendation,
  getDiscoveryListing,
  searchDiscoveryListings,
  startDiscoveryDeepMatch,
  undismissDiscoveryRecommendation,
} from '#/lib/api/client'
import { ApiError } from '#/lib/api/errors'
import type { DiscoveryDeepMatch, DiscoveryListing } from '#/lib/api/schemas'
import { SkillsFit } from '#/components/discovery/JobParts'
import { DISCOVERY_RECOMMENDATIONS_QUERY_KEY } from '#/lib/query/evidenceCaches'
import { writeWorkflowContext } from '#/lib/tools/drafts'

const PAGE_SIZE = 10
// Under the recommendations prefix so Evidence Profile edits (which change the
// match scores) invalidate the search too.
const LISTINGS_KEY = [...DISCOVERY_RECOMMENDATIONS_QUERY_KEY, 'listings']
type SearchParams = Omit<Parameters<typeof searchDiscoveryListings>[0], 'page' | 'limit'>
const listingsQuery = (params: SearchParams, page: number) => ({
  queryKey: [...LISTINGS_KEY, params, page],
  queryFn: () => searchDiscoveryListings({ ...params, page, limit: PAGE_SIZE }),
  staleTime: 60_000,
})
// List responses carry a short preview; the full description is fetched on demand.
const detailQuery = (listingId: string) => ({
  queryKey: [...LISTINGS_KEY, 'detail', listingId],
  queryFn: () => getDiscoveryListing(listingId),
  staleTime: 5 * 60_000,
})

const POSTED_WITHIN = [
  { value: '', label: 'Any time' },
  { value: '1', label: 'Past 24 hours' },
  { value: '3', label: 'Past 3 days' },
  { value: '7', label: 'Past week' },
  { value: '30', label: 'Past month' },
]

type Filters = {
  q: string
  location: string
  remote: boolean
  company: string
  postedWithin: string
  sort: 'best_match' | 'newest'
}

const EMPTY_FILTERS: Filters = {
  q: '',
  location: '',
  remote: false,
  company: '',
  postedWithin: '',
  sort: 'best_match',
}

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function DiscoveryPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { toast, dismiss } = useToast()
  const resultsRef = useRef<HTMLDivElement>(null)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [openListing, setOpenListing] = useState<DiscoveryListing | null>(null)
  // The drawer keeps showing the job it was showing while it fades out.
  const [drawerListing, setDrawerListing] = useState<DiscoveryListing | null>(null)
  const [checkingId, setCheckingId] = useState<string | null>(null)
  // The undo toast is about this page's list: it does not follow the person to another route.
  useEffect(() => () => dismiss('discovery-hidden'), [dismiss])
  const q = useDebounced(filters.q.trim())
  const location = useDebounced(filters.location.trim())

  const params: SearchParams = {
    q: q || undefined,
    location: location || undefined,
    remote: filters.remote || undefined,
    company: filters.company || undefined,
    posted_within_days: filters.postedWithin ? Number(filters.postedWithin) : undefined,
    sort: filters.sort,
  }
  // Any filter change starts again from page 1.
  const paramsKey = JSON.stringify(params)
  const [paging, setPaging] = useState({ key: paramsKey, page: 1 })
  const page = paging.key === paramsKey ? paging.page : 1

  const listings = useQuery({ ...listingsQuery(params, page), placeholderData: keepPreviousData })
  // Page 1 carries the company filter options; it is already cached once you page on.
  const firstPage = useQuery(listingsQuery(params, 1))

  const data = listings.data
  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1
  // Hiding the only job on the last page leaves that page empty.
  useEffect(() => {
    if (data && !listings.isPlaceholderData && page > lastPage) {
      setPaging({ key: paramsKey, page: lastPage })
    }
  }, [data, listings.isPlaceholderData, page, lastPage, paramsKey])

  const goToPage = (next: number) => {
    setPaging({ key: paramsKey, page: next })
    resultsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: LISTINGS_KEY })
  }
  const undoHide = useMutation({
    mutationFn: (listingId: string) => undismissDiscoveryRecommendation(listingId),
    onSuccess: refresh,
  })
  const hide = useMutation({
    mutationFn: (listing: DiscoveryListing) => dismissDiscoveryRecommendation(listing.listing_id),
    retry: false,
    onSuccess: (_result, listing) => {
      if (openListing?.listing_id === listing.listing_id) setOpenListing(null)
      toast({
        id: 'discovery-hidden',
        icon: <EyeOff aria-hidden="true" />,
        title: `Hid “${listing.title}”.`,
        duration: null,
        action: { label: 'Undo', onClick: () => undoHide.mutate(listing.listing_id) },
      })
      refresh()
    },
  })
  const adopt = useMutation({
    mutationFn: (listingId: string) => adoptDiscoveryRecommendation(listingId),
    // A refused or failed request is shown, not repeated behind the person's back.
    retry: false,
    onSuccess: (application) => {
      navigate({ to: '/campaigns/$campaignId', params: { campaignId: application.id } })
    },
  })
  const openDeepMatch = (historyId: string) =>
    navigate({ to: '/job-match/result/$historyId', params: { historyId } })

  const runDeepMatch = useMutation({
    mutationFn: (listing: DiscoveryListing) => startDiscoveryDeepMatch(listing.listing_id),
    retry: false,
    onSuccess: (result, listing) => {
      queryClient.invalidateQueries({ queryKey: [...LISTINGS_KEY, 'detail', listing.listing_id] })
      openDeepMatch(result.history_id)
    },
  })

  /** Reopens the deep match this listing already has, or runs one. */
  const deepMatch = async (listing: DiscoveryListing) => {
    setCheckingId(listing.listing_id)
    try {
      const existing = await queryClient
        .fetchQuery(detailQuery(listing.listing_id))
        .then((detail) => detail.deep_match ?? null)
        .catch(() => null)
      if (existing) {
        openDeepMatch(existing.history_id)
      } else {
        runDeepMatch.mutate(listing)
      }
    } finally {
      setCheckingId(null)
    }
  }

  const tailor = async (listing: DiscoveryListing) => {
    const description = await queryClient
      .fetchQuery(detailQuery(listing.listing_id))
      .then((detail) => detail.description)
      .catch(() => listing.preview)
    // The workflow context is the tab-scoped handoff every tool already reads
    // its job title and description from.
    writeWorkflowContext({
      targetRole: listing.title,
      jobDescription: `${listing.title} at ${listing.company}\n\n${description}`,
      // Tells CV Studio to open its tailor dialog prefilled on arrival (#324).
      tailorPending: true,
      updatedAt: Date.now(),
    })
    navigate({ to: '/cv-studio' })
  }

  const items = data?.items ?? []
  const companies = firstPage.data?.companies ?? []
  const hasEvidence = data?.has_evidence ?? false
  const activeFilterCount = [
    filters.location, filters.company, filters.postedWithin, filters.remote ? 'remote' : '',
  ].filter(Boolean).length
  const filtered = activeFilterCount > 0 || filters.q.trim().length > 0

  const update = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch }))
  const deepMatchFailure = runDeepMatch.isError
    ? { listingId: runDeepMatch.variables?.listing_id, title: runDeepMatch.variables?.title, needsCv: runDeepMatch.error instanceof ApiError && runDeepMatch.error.status === 409 }
    : null
  const actions: JobActions = {
    onOpen: (listing) => {
      setOpenListing(listing)
      setDrawerListing(listing)
    },
    onTailor: tailor,
    onDeepMatch: deepMatch,
    onViewDeepMatch: openDeepMatch,
    onAdopt: (listing) => adopt.mutate(listing.listing_id),
    onHide: (listing) => hide.mutate(listing),
    adoptingId: adopt.isPending ? adopt.variables : undefined,
    hidingId: hide.isPending ? hide.variables?.listing_id : undefined,
    deepMatchingId: checkingId ?? (runDeepMatch.isPending ? runDeepMatch.variables?.listing_id : undefined),
    deepMatchFailure,
  }

  const count = data
    ? `${formatCount(data.total)} ${filtered ? (data.total === 1 ? 'match' : 'matches') : data.total === 1 ? 'open job' : 'open jobs'}`
      + (data.total > 0 && !hasEvidence ? ' · newest first' : '')
    : listings.isPending ? 'Loading jobs…' : undefined

  const headerAction = data && !hasEvidence ? (
    <Button asChild size="sm"><Link to="/profile">Open my profile</Link></Button>
  ) : (
    <Button asChild size="sm" variant="secondary"><Link to="/campaigns">My applications</Link></Button>
  )

  return (
    <Page>
      <PageHeader title="Discover jobs" actions={headerAction} />

      <Stack gap={3} ref={resultsRef}>
        <Toolbar
          role="search"
          aria-label="Filter jobs"
          search={
            <Input
              type="search"
              aria-label="Search jobs"
              placeholder="Title, company or skill"
              leading={<Search aria-hidden="true" />}
              clearable
              value={filters.q}
              onChange={(event) => update({ q: event.target.value })}
            />
          }
          filters={
            <>
              <Input
                aria-label="Location"
                placeholder="Location"
                className="disc-location"
                value={filters.location}
                onChange={(event) => update({ location: event.target.value })}
              />
              <Select aria-label="Company" value={filters.company} onChange={(event) => update({ company: event.target.value })}>
                <option value="">All companies</option>
                {companies.map((company) => <option key={company} value={company}>{company}</option>)}
              </Select>
              <Select aria-label="Posted" value={filters.postedWithin} onChange={(event) => update({ postedWithin: event.target.value })}>
                {POSTED_WITHIN.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
              <Checkbox framed label="Remote only" checked={filters.remote} onCheckedChange={(remote) => update({ remote })} />
            </>
          }
          sort={
            // Held in place (disabled) while the first page loads, so the toolbar does not shift when it arrives.
            hasEvidence || listings.isPending ? (
              <Select
                leading="Sort"
                aria-label="Sort"
                disabled={listings.isPending}
                value={filters.sort}
                onChange={(event) => update({ sort: event.target.value as Filters['sort'] })}
              >
                <option value="best_match">Best skills fit</option>
                <option value="newest">Newest</option>
              </Select>
            ) : undefined
          }
          count={count}
          activeFilters={activeFilterCount}
          onClearFilters={() => setFilters({ ...EMPTY_FILTERS, q: filters.q })}
        />

        {adopt.isError ? (
          <Notice tone="danger" onDismiss={() => adopt.reset()}>
            That job could not be added to your applications. Try again.
          </Notice>
        ) : null}
        {deepMatchFailure ? (
          <Notice
            tone="danger"
            title={deepMatchFailure.title ? `Deep match for “${deepMatchFailure.title}”` : undefined}
            onDismiss={() => runDeepMatch.reset()}
            action={
              deepMatchFailure.needsCv ? (
                <Button asChild size="sm" variant="secondary"><Link to="/cv-studio">Open CV Studio</Link></Button>
              ) : undefined
            }
          >
            {deepMatchFailure.needsCv ? 'Create a CV in CV Studio first.' : 'The deep match could not run. Try again.'}
          </Notice>
        ) : null}

        {listings.isPending ? (
          <>
            <p className="kit-sr-only" role="status">Loading jobs</p>
            <List aria-label="Jobs" aria-busy="true" boxed>
              <Skeleton variant="row" as="li" count={PAGE_SIZE} />
            </List>
          </>
        ) : listings.isError ? (
          <ErrorState
            title="Jobs could not be loaded"
            description="Something went wrong on our side. Your filters are kept."
            onRetry={() => listings.refetch()}
            retrying={listings.isFetching}
          />
        ) : items.length === 0 ? (
          filtered ? (
            <EmptyState
              title="No jobs match these filters"
              description="Try fewer words, a wider location, or a longer time range."
              action={<Button type="button" size="sm" variant="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>Clear all filters</Button>}
            />
          ) : (
            <EmptyState
              title="No jobs yet"
              description="New openings are added every day. Add the ones you like to Applications, where we help you prepare each one."
            />
          )
        ) : (
          <>
            <List aria-label="Jobs" boxed aria-busy={listings.isPlaceholderData}>
              {items.map((listing) => (
                <JobRow key={listing.listing_id} listing={listing} actions={actions} selected={openListing?.listing_id === listing.listing_id} />
              ))}
            </List>
            <Pagination page={page} pageCount={lastPage} onPageChange={goToPage} />
          </>
        )}
      </Stack>

      <Sheet open={openListing !== null} onOpenChange={(open) => { if (!open) setOpenListing(null) }}>
        <SheetContent size="lg">
          {drawerListing ? <JobDetails listing={drawerListing} actions={actions} /> : null}
        </SheetContent>
      </Sheet>
    </Page>
  )
}

type JobActions = {
  onOpen: (listing: DiscoveryListing) => void
  onTailor: (listing: DiscoveryListing) => Promise<void>
  onDeepMatch: (listing: DiscoveryListing) => Promise<void>
  onViewDeepMatch: (historyId: string) => void
  onAdopt: (listing: DiscoveryListing) => void
  onHide: (listing: DiscoveryListing) => void
  adoptingId?: string
  hidingId?: string
  deepMatchingId?: string
  deepMatchFailure: { listingId?: string; title?: string; needsCv: boolean } | null
}

function JobRow({ listing, actions, selected }: { listing: DiscoveryListing; actions: JobActions; selected: boolean }) {
  return (
    <Row selected={selected} aria-current={selected ? 'true' : undefined}>
      <RowBody>
        <RowTitle headingLevel={2} asChild>
          <button type="button" onClick={() => actions.onOpen(listing)}>
            {listing.title}
          </button>
        </RowTitle>
        <RowSubtitle>
          <JobMeta listing={listing} source />
        </RowSubtitle>
      </RowBody>
      {listing.skills_fit !== null ? (
        <RowMeta>
          <SkillsFit listing={listing} />
        </RowMeta>
      ) : null}
      <RowActions reveal={false}>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => actions.onAdopt(listing)}
          loading={actions.adoptingId === listing.listing_id}
          aria-label="Add to applications"
        >
          Add
        </Button>
        <RowReveal>
          <JobOverflowMenu listing={listing} actions={actions} withDeepMatch />
        </RowReveal>
      </RowActions>
    </Row>
  )
}

/** Secondary job actions, shared by the rows and the detail drawer. */
function JobOverflowMenu({
  listing,
  actions,
  withDeepMatch = false,
  triggerVariant = 'ghost',
  triggerClassName,
}: {
  listing: DiscoveryListing
  actions: JobActions
  /** Rows offer the deep match here; the drawer has its own button for it. */
  withDeepMatch?: boolean
  /** The drawer footer sits among bordered buttons, so its trigger is bordered too. */
  triggerVariant?: 'ghost' | 'secondary'
  triggerClassName?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          iconOnly
          size={triggerVariant === 'ghost' ? 'sm' : 'md'}
          variant={triggerVariant}
          className={triggerClassName}
          aria-label={`More actions for ${listing.title}`}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {withDeepMatch ? (
          <DropdownMenuItem
            icon={<Search />}
            onSelect={() => void actions.onDeepMatch(listing)}
            disabled={actions.deepMatchingId === listing.listing_id}
          >
            Deep match
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem icon={<FileText />} onSelect={() => void actions.onTailor(listing)}>
          Tailor my CV
        </DropdownMenuItem>
        <DropdownMenuItem asChild icon={<ArrowUpRight />}>
          <a href={listing.apply_url ?? listing.source_url} target="_blank" rel="noopener noreferrer">
            Apply on company site
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={<EyeOff />}
          onSelect={() => actions.onHide(listing)}
          disabled={actions.hidingId === listing.listing_id}
        >
          Hide this job
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function JobDetails({ listing, actions }: { listing: DiscoveryListing; actions: JobActions }) {
  const detail = useQuery(detailQuery(listing.listing_id))
  const deepMatch = detail.data?.deep_match ?? null
  const failure = actions.deepMatchFailure?.listingId === listing.listing_id ? actions.deepMatchFailure : null
  return (
    <>
      <SheetHeader>
        <SheetTitle>{listing.title}</SheetTitle>
        <SheetDescription asChild>
          <div><JobMeta listing={listing} source /></div>
        </SheetDescription>
      </SheetHeader>
      <SheetBody>
        <Stack gap={6}>
          {failure ? (
            <Notice
              tone="danger"
              action={
                failure.needsCv ? (
                  <Button asChild size="sm" variant="secondary"><Link to="/cv-studio">Open CV Studio</Link></Button>
                ) : undefined
              }
            >
              {failure.needsCv ? 'Create a CV in CV Studio first.' : 'The deep match could not run. Try again.'}
            </Notice>
          ) : null}
          <FitSection listing={listing} deepMatch={deepMatch} />
          {/* Plain text on purpose: listing descriptions come from third-party boards. */}
          <Section
            headingLevel={3}
            title="Description"
            actions={
              <Button asChild variant="secondary" size="sm">
                <a href={listing.source_url} target="_blank" rel="noopener noreferrer">
                  Original listing <ArrowUpRight aria-hidden="true" />
                </a>
              </Button>
            }
          >
            {detail.isPending ? (
              <Skeleton lines={5} label="Loading the full description…" />
            ) : (
              <div className="disc-description">{detail.data?.description ?? listing.preview}</div>
            )}
          </Section>
        </Stack>
      </SheetBody>
      <SheetFooter className="disc-footer">
        <JobOverflowMenu listing={listing} actions={actions} triggerClassName="disc-footer__more" triggerVariant="secondary" />
        {deepMatch ? (
          <Button type="button" variant="secondary" className="disc-footer__deep" onClick={() => actions.onViewDeepMatch(deepMatch.history_id)}>
            View deep match
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            className="disc-footer__deep"
            onClick={() => void actions.onDeepMatch(listing)}
            loading={actions.deepMatchingId === listing.listing_id}
          >
            Deep match
          </Button>
        )}
        <Button
          type="button"
          className="disc-footer__add"
          onClick={() => actions.onAdopt(listing)}
          loading={actions.adoptingId === listing.listing_id}
        >
          Add to applications
        </Button>
      </SheetFooter>
    </>
  )
}

/** Why a listing fits: the score, skills matched and missing, and the preferences it hits. */
function FitSection({
  listing,
  deepMatch,
}: {
  listing: DiscoveryListing
  deepMatch: DiscoveryDeepMatch | null
}) {
  const similar = listing.similar_applications
  const total = listing.matched_skills.length + listing.missing_skills.length
  const hasRows =
    deepMatch !== null ||
    similar != null ||
    listing.matched_skills.length > 0 ||
    listing.missing_skills.length > 0 ||
    listing.preference_hits.length > 0
  return (
    <Section headingLevel={3} title="Skills fit" className="disc-fit">
      <Stack gap={4}>
        {listing.skills_fit === null ? (
          <Notice
            action={<Button asChild size="sm" variant="secondary"><Link to="/profile">Open my profile</Link></Button>}
          >
            Confirm your skills in your profile to see how well they fit this job.
          </Notice>
        ) : (
          <ScoreBar
            aria-label={`${listing.skills_fit}% skills fit, ${listing.matched_skills.length} of ${total} skill${total === 1 ? '' : 's'}`}
            value={listing.skills_fit}
            valueLabel={`${listing.skills_fit}% · ${listing.matched_skills.length} of ${total} skill${total === 1 ? '' : 's'}`}
            lowTone="neutral"
          />
        )}
        {hasRows ? (
          <KeyValue layout="stacked" divided={false}>
            {deepMatch ? (
              <KeyValueRow label="Deep match">
                {deepMatch.match_score}%{deepMatch.verdict ? ` · ${deepMatch.verdict}` : ''}
              </KeyValueRow>
            ) : null}
            {listing.skills_fit !== null && similar ? (
              <KeyValueRow label="Similar applications of yours">
                <>{similar.replied} of {similar.applied} got a reply</>
                <span className="disc-note">
                  Your {similar.role_family.toLowerCase()} applications with {similar.fit_bucket.toLowerCase()}
                </span>
              </KeyValueRow>
            ) : null}
            {listing.skills_fit !== null ? <SkillRow label="Skills you match" items={listing.matched_skills} tone="neutral" /> : null}
            {listing.skills_fit !== null ? <SkillRow label="Skills to add" items={listing.missing_skills} tone="warning" /> : null}
            <SkillRow label="Matches your preferences" items={listing.preference_hits} tone="accent" />
          </KeyValue>
        ) : null}
      </Stack>
    </Section>
  )
}

function SkillRow({ label, items, tone }: { label: string; items: string[]; tone: 'neutral' | 'warning' | 'accent' }) {
  if (items.length === 0) return null
  return (
    <KeyValueRow label={label}>
      <Cluster gap={1}>
        {items.map((item) => <Badge key={item} tone={tone}>{item}</Badge>)}
      </Cluster>
    </KeyValueRow>
  )
}

function JobMeta({ listing, source = false }: { listing: DiscoveryListing; source?: boolean }) {
  const posted = relativeDays(listing.posted_at)
  const saysRemote = /remote/i.test(listing.location ?? '')
  return (
    <MetaRow className="disc-meta">
      <strong>{listing.company}</strong>
      {listing.location}
      {listing.remote && !saysRemote ? 'Remote' : null}
      {posted}
      {source ? `via ${listing.source_name}` : null}
    </MetaRow>
  )
}

function relativeDays(value: string | null, now = Date.now()): string | null {
  if (!value) return null
  const days = Math.floor((now - new Date(value).getTime()) / 86_400_000)
  if (Number.isNaN(days)) return null
  if (days <= 0) return 'Posted today'
  if (days === 1) return 'Posted yesterday'
  if (days < 30) return `Posted ${days} days ago`
  const months = Math.floor(days / 30)
  return months < 12 ? `Posted ${months} ${months === 1 ? 'month' : 'months'} ago` : 'Posted over a year ago'
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US')
}
