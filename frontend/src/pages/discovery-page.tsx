import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react'
import { PageHero } from '#/components/app/PageHero'
import { WorkspaceEmpty, WorkspacePage } from '#/components/app/WorkspacePage'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import {
  adoptDiscoveryRecommendation,
  dismissDiscoveryRecommendation,
  getDiscoveryListing,
  searchDiscoveryListings,
  startDiscoveryDeepMatch,
  undismissDiscoveryRecommendation,
} from '#/lib/api/client'
import { ApiError } from '#/lib/api/errors'
import type { DiscoveryListing } from '#/lib/api/schemas'
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
  const resultsRef = useRef<HTMLElement>(null)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [openListing, setOpenListing] = useState<DiscoveryListing | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [hidden, setHidden] = useState<DiscoveryListing | null>(null)
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
  const hide = useMutation({
    mutationFn: (listing: DiscoveryListing) => dismissDiscoveryRecommendation(listing.listing_id),
    onSuccess: (_result, listing) => {
      setHidden(listing)
      if (openListing?.listing_id === listing.listing_id) setOpenListing(null)
      refresh()
    },
  })
  const undoHide = useMutation({
    mutationFn: (listingId: string) => undismissDiscoveryRecommendation(listingId),
    onSuccess: () => {
      setHidden(null)
      refresh()
    },
  })
  const adopt = useMutation({
    mutationFn: (listingId: string) => adoptDiscoveryRecommendation(listingId),
    onSuccess: (application) => {
      navigate({ to: '/campaigns/$campaignId', params: { campaignId: application.id } })
    },
  })

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
  const actions: CardActions = {
    onOpen: setOpenListing,
    onTailor: tailor,
    onAdopt: (listing) => adopt.mutate(listing.listing_id),
    onHide: (listing) => hide.mutate(listing),
    adoptingId: adopt.isPending ? adopt.variables : undefined,
    hidingId: hide.isPending ? hide.variables?.listing_id : undefined,
  }

  const headerMeta = data
    ? [
        `${formatCount(data.total)} ${filtered ? (data.total === 1 ? 'match' : 'matches') : data.total === 1 ? 'open job' : 'open jobs'}`,
        ...(data.total > 0 ? [hasEvidence && filters.sort === 'best_match' ? 'best skills fit first' : 'newest first'] : []),
      ]
    : []

  const heroAction = data && !hasEvidence ? (
    <Button asChild size="sm"><Link to="/profile">Open my profile</Link></Button>
  ) : (
    <Button asChild size="sm" variant="outline"><Link to="/campaigns">My applications</Link></Button>
  )

  return (
    <WorkspacePage className="disc-page">
      <PageHero
        title="Discover jobs"
        action={heroAction}
        chips={data ? headerMeta : undefined}
      />

      <div className="disc-filters" role="search" aria-label="Filter jobs">
        <label className="disc-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            value={filters.q}
            onChange={(event) => update({ q: event.target.value })}
            placeholder="Title, company or skill"
            aria-label="Search jobs"
          />
        </label>
        <div className="disc-filters__inline">
          <FilterFields filters={filters} companies={companies} onChange={update} />
        </div>
        {hasEvidence ? (
          <label className="disc-sort">
            <span>Sort</span>
            <select
              className="disc-field"
              value={filters.sort}
              onChange={(event) => update({ sort: event.target.value as Filters['sort'] })}
            >
              <option value="best_match">Best skills fit</option>
              <option value="newest">Newest</option>
            </select>
          </label>
        ) : null}
        <button
          type="button"
          className="disc-filters__toggle"
          onClick={() => setFiltersOpen(true)}
          aria-label={`Filters${activeFilterCount ? ` (${activeFilterCount} active)` : ''}`}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          Filters
          {activeFilterCount ? <span className="disc-filters__count">{activeFilterCount}</span> : null}
        </button>
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="disc-filter-sheet">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Narrow the list to the jobs you want to see.</SheetDescription>
          </SheetHeader>
          <div className="disc-filter-sheet__body">
            <FilterFields filters={filters} companies={companies} onChange={update} stacked />
          </div>
          <div className="disc-filter-sheet__footer">
            <Button type="button" size="sm" variant="ghost" onClick={() => setFilters({ ...EMPTY_FILTERS, q: filters.q })}>
              Clear
            </Button>
            <Button type="button" size="sm" onClick={() => setFiltersOpen(false)}>Show jobs</Button>
          </div>
        </SheetContent>
      </Sheet>

      <section className="disc-results" aria-label="Jobs" ref={resultsRef}>
        {hidden
          ? createPortal(
              <div className="disc-toast" role="status">
                <EyeOff size={15} aria-hidden="true" />
                <span>Hid “{hidden.title}”.</span>
                <button type="button" onClick={() => undoHide.mutate(hidden.listing_id)} disabled={undoHide.isPending}>
                  Undo
                </button>
                <button type="button" onClick={() => setHidden(null)} aria-label="Dismiss">
                  <X size={14} aria-hidden="true" />
                </button>
              </div>,
              document.body,
            )
          : null}
        {adopt.isError ? (
          <p className="disc-error" role="alert">That job could not be added to your applications. Try again.</p>
        ) : null}

        {listings.isPending ? (
          <div className="disc-list" role="status" aria-label="Loading jobs">
            {[0, 1, 2, 3].map((index) => <div key={index} className="disc-row disc-row--skeleton" />)}
          </div>
        ) : listings.isError ? (
          <WorkspaceEmpty
            title="Jobs could not be loaded"
            description="Something went wrong on our side. Your filters are kept."
            action={<Button type="button" size="sm" variant="outline" onClick={() => listings.refetch()}>Try again</Button>}
          />
        ) : items.length === 0 ? (
          filtered ? (
            <WorkspaceEmpty
                title="No jobs match these filters"
              description="Try fewer words, a wider location, or a longer time range."
              action={<Button type="button" size="sm" variant="outline" onClick={() => setFilters(EMPTY_FILTERS)}>Clear all filters</Button>}
            />
          ) : (
            <WorkspaceEmpty
              title="No jobs yet"
              description="New openings are added every day. Add the ones you like to Applications, where we help you prepare each one."
            />
          )
        ) : (
          <>
            <ol className="disc-list" aria-busy={listings.isPlaceholderData}>
              {items.map((listing) => (
                <li key={listing.listing_id}>
                  <JobRow listing={listing} actions={actions} selected={openListing?.listing_id === listing.listing_id} />
                </li>
              ))}
            </ol>
            {lastPage > 1 ? <Pagination page={page} lastPage={lastPage} onChange={goToPage} /> : null}
          </>
        )}
      </section>

      <Sheet open={openListing !== null} onOpenChange={(open) => { if (!open) setOpenListing(null) }}>
        <SheetContent side="right" className="disc-drawer">
          {openListing ? <JobDetails listing={openListing} actions={actions} /> : null}
        </SheetContent>
      </Sheet>
    </WorkspacePage>
  )
}

function FilterFields({
  filters,
  companies,
  onChange,
  stacked = false,
}: {
  filters: Filters
  companies: string[]
  onChange: (patch: Partial<Filters>) => void
  stacked?: boolean
}) {
  return (
    <div className={stacked ? 'disc-fields disc-fields--stacked' : 'disc-fields'}>
      <label className="disc-field disc-field--location">
                <input
          value={filters.location}
          onChange={(event) => onChange({ location: event.target.value })}
          placeholder="Location"
          aria-label="Location"
        />
      </label>
      <select
        className="disc-field"
        value={filters.company}
        onChange={(event) => onChange({ company: event.target.value })}
        aria-label="Company"
      >
        <option value="">All companies</option>
        {companies.map((company) => <option key={company} value={company}>{company}</option>)}
      </select>
      <select
        className="disc-field"
        value={filters.postedWithin}
        onChange={(event) => onChange({ postedWithin: event.target.value })}
        aria-label="Posted"
      >
        {POSTED_WITHIN.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <button
        type="button"
        className="disc-field disc-remote"
        aria-pressed={filters.remote}
        onClick={() => onChange({ remote: !filters.remote })}
      >
        <span className="disc-remote__switch" aria-hidden="true" />
        Remote only
      </button>
    </div>
  )
}

type CardActions = {
  onOpen: (listing: DiscoveryListing) => void
  onTailor: (listing: DiscoveryListing) => Promise<void>
  onAdopt: (listing: DiscoveryListing) => void
  onHide: (listing: DiscoveryListing) => void
  adoptingId?: string
  hidingId?: string
}

function AdoptButton({ listing, actions }: { listing: DiscoveryListing; actions: CardActions }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => actions.onAdopt(listing)}
      loading={actions.adoptingId === listing.listing_id}
      aria-label="Add to applications"
    >
      Add
    </Button>
  )
}

/** Runs the deep match, or reopens the one this listing already has. */
function useDeepMatch(listing: DiscoveryListing) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const openResult = (historyId: string) =>
    navigate({ to: '/job-match/result/$historyId', params: { historyId } })
  const run = useMutation({
    mutationFn: () => startDiscoveryDeepMatch(listing.listing_id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [...LISTINGS_KEY, 'detail', listing.listing_id] })
      openResult(result.history_id)
    },
  })
  return { run, openResult }
}

function JobRow({ listing, actions, selected }: { listing: DiscoveryListing; actions: CardActions; selected: boolean }) {
  const queryClient = useQueryClient()
  const { run, openResult } = useDeepMatch(listing)
  const [checking, setChecking] = useState(false)
  const needsCv = run.error instanceof ApiError && run.error.status === 409
  const deepMatch = async () => {
    setChecking(true)
    try {
      const existing = await queryClient
        .fetchQuery(detailQuery(listing.listing_id))
        .then((detail) => detail.deep_match ?? null)
        .catch(() => null)
      if (existing) openResult(existing.history_id)
      else run.mutate()
    } finally {
      setChecking(false)
    }
  }
  return (
    <article className="disc-row" data-selected={selected || undefined} aria-labelledby={`job-${listing.listing_id}`}>
      <div className="disc-row__main">
        <h2 id={`job-${listing.listing_id}`} className="disc-row__heading">
          <button type="button" className="disc-row__title" onClick={() => actions.onOpen(listing)}>
            {listing.title}
          </button>
        </h2>
        <JobMeta listing={listing} source />
        {run.isError ? (
          <p className="disc-error" role="alert">
            {needsCv ? (
              <>Create a CV in CV Studio first. <Link to="/cv-studio">Open CV Studio</Link></>
            ) : (
              'The deep match could not run. Try again.'
            )}
          </p>
        ) : null}
      </div>
      <SkillsFit listing={listing} />
      <div className="disc-row__actions">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="disc-row__reveal"
          onClick={() => void deepMatch()}
          loading={checking || run.isPending}
        >
          Deep match
        </Button>
        <AdoptButton listing={listing} actions={actions} />
        <span className="disc-row__reveal"><JobOverflowMenu listing={listing} actions={actions} /></span>
      </div>
    </article>
  )
}

/** Secondary job actions, shared by feed cards and the detail drawer. */
function JobOverflowMenu({ listing, actions }: { listing: DiscoveryListing; actions: CardActions }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="icon-sm" variant="ghost" aria-label={`More actions for ${listing.title}`}>
          <MoreHorizontal size={16} aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => void actions.onTailor(listing)}>
          <Sparkles aria-hidden="true" /> Tailor my CV
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={listing.apply_url ?? listing.source_url} target="_blank" rel="noopener noreferrer">
            <ArrowUpRight aria-hidden="true" /> Apply on company site
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => actions.onHide(listing)}
          disabled={actions.hidingId === listing.listing_id}
        >
          <EyeOff aria-hidden="true" /> Hide this job
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function JobDetails({ listing, actions }: { listing: DiscoveryListing; actions: CardActions }) {
  const detail = useQuery(detailQuery(listing.listing_id))
  const deepMatch = detail.data?.deep_match ?? null
  const { run, openResult } = useDeepMatch(listing)
  const needsCv = run.error instanceof ApiError && run.error.status === 409
  return (
    <div className="disc-drawer__inner">
      <SheetHeader className="disc-drawer__head">
        <SheetTitle className="disc-drawer__title">{listing.title}</SheetTitle>
        <SheetDescription asChild>
          <div><JobMeta listing={listing} /></div>
        </SheetDescription>
        <SkillsFit listing={listing} />
      </SheetHeader>
      <div className="disc-drawer__scroll">
        <FitPanel listing={listing} />
        {/* Plain text on purpose: listing descriptions come from third-party boards. */}
        <section className="disc-drawer__section" aria-label="Description">
          <h3>Description</h3>
          <div className="disc-drawer__description" aria-busy={detail.isPending}>
            {detail.data?.description ?? (detail.isError ? listing.preview : 'Loading the full description…')}
          </div>
        </section>
      </div>
      <div className="disc-drawer__footer">
        {deepMatch ? (
          <p className="disc-drawer__deep" aria-label="Deep match">
            Deep match {deepMatch.match_score}%
            {deepMatch.verdict ? ` · ${deepMatch.verdict}` : ''}
          </p>
        ) : null}
        {run.isError ? (
          <p className="disc-error" role="alert">
            {needsCv ? (
              <>Create a CV in CV Studio first. <Link to="/cv-studio">Open CV Studio</Link></>
            ) : (
              'The deep match could not run. Try again.'
            )}
          </p>
        ) : null}
        <div className="disc-drawer__actions">
          {deepMatch ? (
            <Button type="button" size="sm" onClick={() => openResult(deepMatch.history_id)}>
              View deep match
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={() => run.mutate()} loading={run.isPending}>
              Deep match
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => actions.onAdopt(listing)}
            loading={actions.adoptingId === listing.listing_id}
          >
            Add to applications
          </Button>
          <JobOverflowMenu listing={listing} actions={actions} />
        </div>
        <span className="disc-drawer__via">
          via {listing.source_name} ·{' '}
          <a href={listing.source_url} target="_blank" rel="noopener noreferrer">original listing</a>
        </span>
      </div>
    </div>
  )
}

/** Why a listing fits: skills matched and missing, and the preferences it hits. */
function FitPanel({ listing }: { listing: DiscoveryListing }) {
  if (listing.skills_fit === null) {
    return (
      <section className="disc-fit disc-drawer__section" aria-label="Skills fit">
        <p className="disc-fit__prompt">
          Confirm your skills in your profile to see how well they fit this job.{' '}
          <Link to="/profile">Open my profile</Link>
        </p>
        <ChipRow label="Matches your preferences" items={listing.preference_hits} tone="pref" />
      </section>
    )
  }
  return (
    <section className="disc-fit disc-drawer__section" aria-label="Skills fit">
      <SimilarOutcomes listing={listing} />
      <ChipRow label="Skills you match" items={listing.matched_skills} tone="match" />
      <ChipRow label="Skills to add" items={listing.missing_skills} tone="missing" />
      <ChipRow label="Matches your preferences" items={listing.preference_hits} tone="pref" />
    </section>
  )
}

/** The owner's own reply rate for similar applications; a separate signal from skills fit. */
function SimilarOutcomes({ listing }: { listing: DiscoveryListing }) {
  const similar = listing.similar_applications
  if (!similar) return null
  return (
    <p
      className="disc-odds"
      title={`Your ${similar.role_family.toLowerCase()} applications with ${similar.fit_bucket.toLowerCase()}`}
    >
      <span>
        Similar applications of yours: <strong>{similar.replied} of {similar.applied}</strong> got a reply
      </span>
    </p>
  )
}

function ChipRow({ label, items, tone }: { label: string; items: string[]; tone: 'match' | 'missing' | 'pref' }) {
  if (items.length === 0) return null
  return (
    <div className="disc-fit__row">
      <h3>{label}</h3>
      <p className="disc-fit__items">
        {items.map((item) => <span key={item} className={`disc-chip disc-chip--${tone}`}>{item}</span>)}
      </p>
    </div>
  )
}

function Pagination({ page, lastPage, onChange }: { page: number; lastPage: number; onChange: (page: number) => void }) {
  return (
    <nav className="disc-pager" aria-label="Pages">
      <Button type="button" size="sm" variant="ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft size={14} aria-hidden="true" /> Previous
      </Button>
      <ol className="disc-pager__pages">
        {pageNumbers(page, lastPage).map((number, index) =>
          number === null ? (
            <li key={`gap-${index}`} className="disc-pager__gap" aria-hidden="true">…</li>
          ) : (
            <li key={number}>
              <button
                type="button"
                className="disc-pager__page"
                aria-label={`Page ${number}`}
                aria-current={number === page ? 'page' : undefined}
                onClick={() => onChange(number)}
              >
                {number}
              </button>
            </li>
          ),
        )}
      </ol>
      <Button type="button" size="sm" variant="ghost" disabled={page >= lastPage} onClick={() => onChange(page + 1)}>
        Next <ChevronRight size={14} aria-hidden="true" />
      </Button>
    </nav>
  )
}

/** First, last and the current page's neighbours; null marks a gap. */
function pageNumbers(page: number, lastPage: number): (number | null)[] {
  const shown = [...new Set([1, page - 1, page, page + 1, lastPage])]
    .filter((number) => number >= 1 && number <= lastPage)
    .sort((a, b) => a - b)
  return shown.flatMap((number, index) =>
    index > 0 && number - shown[index - 1] > 1 ? [null, number] : [number],
  )
}

function JobMeta({ listing, source = false }: { listing: DiscoveryListing; source?: boolean }) {
  const posted = relativeDays(listing.posted_at)
  const saysRemote = /remote/i.test(listing.location ?? '')
  return (
    <p className="disc-meta">
      <span className="disc-meta__company">{listing.company}</span>
      {listing.location ? <span>{listing.location}</span> : null}
      {listing.remote && !saysRemote ? <span>Remote</span> : null}
      {posted ? <span className="disc-meta__posted">{posted}</span> : null}
      {source ? <span>via {listing.source_name}</span> : null}
    </p>
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
