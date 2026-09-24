import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowUpRight,
  BadgeCheck,
  Compass,
  EyeOff,
  FolderPlus,
  MapPin,
  Search,
  SearchX,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react'
import {
  StatusPill,
  WorkspaceEmpty,
  WorkspaceHero,
  WorkspacePage,
} from '#/components/app/WorkspacePage'
import { Button } from '#/components/ui/button'
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
  getDiscoveryPersonalization,
  searchDiscoveryListings,
  undismissDiscoveryRecommendation,
  unhideDiscoverySource,
} from '#/lib/api/client'
import type { DiscoveryListing } from '#/lib/api/schemas'
import { DISCOVERY_RECOMMENDATIONS_QUERY_KEY } from '#/lib/query/evidenceCaches'
import { writeWorkflowContext } from '#/lib/tools/drafts'

const PAGE_SIZE = 20
const PERSONALIZATION_KEY = ['discovery', 'personalization']
// Under the recommendations prefix so Evidence Profile edits (which change the
// match scores) invalidate the search too.
const LISTINGS_KEY = [...DISCOVERY_RECOMMENDATIONS_QUERY_KEY, 'listings']

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
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [openListing, setOpenListing] = useState<DiscoveryListing | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [hidden, setHidden] = useState<DiscoveryListing | null>(null)
  const q = useDebounced(filters.q.trim())
  const location = useDebounced(filters.location.trim())

  const params = {
    q: q || undefined,
    location: location || undefined,
    remote: filters.remote || undefined,
    company: filters.company || undefined,
    posted_within_days: filters.postedWithin ? Number(filters.postedWithin) : undefined,
    sort: filters.sort,
  }
  const listings = useInfiniteQuery({
    queryKey: [...LISTINGS_KEY, params],
    queryFn: ({ pageParam }) =>
      searchDiscoveryListings({ ...params, page: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
    staleTime: 60_000,
  })
  const personalization = useQuery({
    queryKey: PERSONALIZATION_KEY,
    queryFn: getDiscoveryPersonalization,
    staleTime: 60_000,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: LISTINGS_KEY })
    queryClient.invalidateQueries({ queryKey: PERSONALIZATION_KEY })
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
  const unhideCompany = useMutation({
    mutationFn: (sourceId: string) => unhideDiscoverySource(sourceId),
    onSuccess: refresh,
  })
  const adopt = useMutation({
    mutationFn: (listingId: string) => adoptDiscoveryRecommendation(listingId),
    onSuccess: (campaign) => {
      navigate({ to: '/campaigns/$campaignId', params: { campaignId: campaign.id } })
    },
  })

  const tailor = (listing: DiscoveryListing) => {
    // The workflow context is the tab-scoped handoff every tool already reads
    // its job title and description from.
    writeWorkflowContext({
      targetRole: listing.title,
      jobDescription: `${listing.title} at ${listing.company}\n\n${listing.description}`,
      updatedAt: Date.now(),
    })
    navigate({ to: '/cv-studio' })
  }

  const first = listings.data?.pages[0]
  // Hiding a job shifts later pages by one; de-duplicate across page seams.
  const items = [
    ...new Map(
      (listings.data?.pages ?? []).flatMap((page) => page.items).map((item) => [item.listing_id, item]),
    ).values(),
  ]
  const hasProfile = first?.has_profile ?? false
  const hiddenCompanies = personalization.data?.hidden_sources ?? []
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

  return (
    <WorkspacePage className="disc-page">
      <WorkspaceHero
        icon={Compass}
        eyebrow="Job discovery"
        title="Discover jobs"
        subtitle="Real openings posted on company career sites, checked against the skills you confirmed in your profile."
        stats={[
          { label: 'Jobs available', value: formatCount(first?.stats.jobs) },
          { label: 'Companies', value: formatCount(first?.stats.companies) },
          { label: 'New this week', value: formatCount(first?.stats.new_this_week) },
        ]}
      />

      {first && !hasProfile ? (
        <div className="disc-nudge" role="note">
          <BadgeCheck size={18} aria-hidden="true" />
          <p>
            <strong>See how well each job fits you.</strong> Confirm a few skills in your
            profile and every job gets a match score.
          </p>
          <Link to="/profile" className="disc-nudge__link">Open my profile</Link>
        </div>
      ) : null}

      <div className="disc-filters" role="search" aria-label="Filter jobs">
        <label className="disc-search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={filters.q}
            onChange={(event) => update({ q: event.target.value })}
            placeholder="Title, company or skill"
            aria-label="Search jobs"
          />
        </label>
        <div className="disc-filters__inline">
          <FilterFields filters={filters} companies={first?.companies ?? []} onChange={update} />
        </div>
        <button
          type="button"
          className="disc-filters__toggle"
          onClick={() => setFiltersOpen(true)}
          aria-label={`Filters${activeFilterCount ? ` (${activeFilterCount} active)` : ''}`}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
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
            <FilterFields filters={filters} companies={first?.companies ?? []} onChange={update} stacked />
          </div>
          <div className="disc-filter-sheet__footer">
            <Button type="button" variant="ghost" onClick={() => setFilters({ ...EMPTY_FILTERS, q: filters.q })}>
              Clear
            </Button>
            <Button type="button" onClick={() => setFiltersOpen(false)}>Show jobs</Button>
          </div>
        </SheetContent>
      </Sheet>

      {hiddenCompanies.length > 0 ? (
        <div className="disc-hidden" aria-label="Hidden companies">
          <span>Hidden companies:</span>
          {hiddenCompanies.map((source) => (
            <button
              key={source.source_id}
              type="button"
              onClick={() => unhideCompany.mutate(source.source_id)}
              disabled={unhideCompany.isPending}
              aria-label={`Show ${source.display_name} again`}
            >
              {source.display_name} <Undo2 size={12} aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}

      <section className="disc-results" aria-label="Jobs">
        <div className="disc-results__head">
          <p className="disc-results__count" aria-live="polite">
            {first ? (
              <>
                <strong>{formatCount(first.total)}</strong> {first.total === 1 ? 'job' : 'jobs'}
                {hasProfile && filters.sort === 'best_match' ? ' · best matches first' : ' · newest first'}
              </>
            ) : ' '}
          </p>
          {hasProfile ? (
            <label className="disc-sort">
              <span>Sort</span>
              <select
                className="workspace-select"
                value={filters.sort}
                onChange={(event) => update({ sort: event.target.value as Filters['sort'] })}
              >
                <option value="best_match">Best match</option>
                <option value="newest">Newest</option>
              </select>
            </label>
          ) : null}
        </div>

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
          <p className="disc-error" role="alert">That job could not be added to a campaign. Try again.</p>
        ) : null}

        {listings.isPending ? (
          <div className="disc-list" role="status" aria-label="Loading jobs">
            {[0, 1, 2, 3].map((index) => <div key={index} className="disc-card disc-card--skeleton" />)}
          </div>
        ) : listings.isError ? (
          <WorkspaceEmpty
            icon={SearchX}
            title="Jobs could not be loaded"
            description="Something went wrong on our side. Your filters are kept."
            action={<Button type="button" variant="outline" onClick={() => listings.refetch()}>Try again</Button>}
          />
        ) : items.length === 0 ? (
          filtered ? (
            <WorkspaceEmpty
              icon={SearchX}
              title="No jobs match these filters"
              description="Try fewer words, a wider location, or a longer time range."
              action={<Button type="button" variant="outline" onClick={() => setFilters(EMPTY_FILTERS)}>Clear all filters</Button>}
            />
          ) : (
            <WorkspaceEmpty
              icon={Compass}
              title="No jobs yet"
              description="New openings are added every day. Check back soon."
            />
          )
        ) : (
          <>
            <ol className="disc-list">
              {items.map((listing) => (
                <li key={listing.listing_id}>
                  <JobCard listing={listing} actions={actions} />
                </li>
              ))}
            </ol>
            {listings.hasNextPage ? (
              <div className="disc-more">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => listings.fetchNextPage()}
                  loading={listings.isFetchingNextPage}
                >
                  Show more jobs
                </Button>
                <span>{items.length} of {formatCount(first?.total)}</span>
              </div>
            ) : null}
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
        <MapPin size={15} aria-hidden="true" />
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
  onTailor: (listing: DiscoveryListing) => void
  onAdopt: (listing: DiscoveryListing) => void
  onHide: (listing: DiscoveryListing) => void
  adoptingId?: string
  hidingId?: string
}

function JobCard({ listing, actions }: { listing: DiscoveryListing; actions: CardActions }) {
  return (
    <article className="disc-card" aria-labelledby={`job-${listing.listing_id}`}>
      <CompanyAvatar name={listing.company} />
      <div className="disc-card__body">
        <div className="disc-card__top">
          <div className="disc-card__heading">
            <h2 id={`job-${listing.listing_id}`}>
              <button type="button" className="disc-card__title" onClick={() => actions.onOpen(listing)}>
                {listing.title}
              </button>
            </h2>
            <JobMeta listing={listing} />
          </div>
          <MatchScore listing={listing} />
        </div>
        <p className="disc-card__preview">{preview(listing.description)}</p>
        {listing.matched_keywords.length > 0 ? (
          <p className="disc-card__skills">
            <span>Matches your profile:</span>
            {listing.matched_keywords.slice(0, 4).map((keyword) => (
              <span key={keyword} className="disc-chip">{keyword}</span>
            ))}
          </p>
        ) : null}
        <div className="disc-card__footer">
          <JobActions listing={listing} actions={actions} />
          <span className="disc-card__via">via {listing.source_name}</span>
        </div>
      </div>
    </article>
  )
}

function JobDetails({ listing, actions }: { listing: DiscoveryListing; actions: CardActions }) {
  return (
    <div className="disc-drawer__inner">
      <SheetHeader className="disc-drawer__head">
        <div className="disc-drawer__title-row">
          <CompanyAvatar name={listing.company} />
          <div>
            <SheetTitle className="disc-drawer__title">{listing.title}</SheetTitle>
            <SheetDescription asChild>
              <div><JobMeta listing={listing} /></div>
            </SheetDescription>
          </div>
        </div>
        <MatchScore listing={listing} detailed />
      </SheetHeader>
      {/* Plain text on purpose: listing descriptions come from third-party boards. */}
      <div className="disc-drawer__description">{listing.description}</div>
      <div className="disc-drawer__footer">
        <JobActions listing={listing} actions={actions} />
        <span className="disc-card__via">
          via {listing.source_name} ·{' '}
          <a href={listing.source_url} target="_blank" rel="noopener noreferrer">original listing</a>
        </span>
      </div>
    </div>
  )
}

function JobActions({ listing, actions }: { listing: DiscoveryListing; actions: CardActions }) {
  return (
    <div className="disc-actions">
      <Button type="button" size="sm" onClick={() => actions.onTailor(listing)}>
        <Sparkles size={14} aria-hidden="true" /> Tailor my CV
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => actions.onAdopt(listing)}
        loading={actions.adoptingId === listing.listing_id}
      >
        <FolderPlus size={14} aria-hidden="true" /> Add to campaign
      </Button>
      <Button asChild size="sm" variant="outline">
        <a href={listing.apply_url ?? listing.source_url} target="_blank" rel="noopener noreferrer">
          Apply on company site <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => actions.onHide(listing)}
        disabled={actions.hidingId === listing.listing_id}
        aria-label={`Hide ${listing.title}`}
      >
        <EyeOff size={14} aria-hidden="true" /> Hide
      </Button>
    </div>
  )
}

function JobMeta({ listing }: { listing: DiscoveryListing }) {
  const posted = relativeDays(listing.posted_at)
  return (
    <p className="disc-meta">
      <span className="disc-meta__company">{listing.company}</span>
      {listing.location ? <span>{listing.location}</span> : null}
      {listing.remote ? <StatusPill tone="accent">Remote</StatusPill> : null}
      {listing.department ? <span className="disc-meta__dept">{listing.department}</span> : null}
      {posted ? <span className="disc-meta__posted">{posted}</span> : null}
    </p>
  )
}

function MatchScore({ listing, detailed = false }: { listing: DiscoveryListing; detailed?: boolean }) {
  if (listing.score === null) return null
  const tone = listing.score >= 70 ? 'good' : listing.score >= 41 ? 'fair' : 'low'
  return (
    <div className={`disc-score disc-score--${tone}`} aria-label={`${listing.score}% match`}>
      <strong>{listing.score}%</strong>
      <span>match</span>
      {detailed && listing.matched_keywords.length > 0 ? (
        <p className="disc-score__skills">Matches {listing.matched_keywords.slice(0, 6).join(', ')}</p>
      ) : null}
    </div>
  )
}

const AVATAR_HUES = [211, 199, 226, 187, 240, 172]

function CompanyAvatar({ name }: { name: string }) {
  const hue = AVATAR_HUES[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % AVATAR_HUES.length]
  return (
    <span className="disc-avatar" style={{ '--avatar-hue': hue } as CSSProperties} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

function preview(description: string): string {
  const text = description.replace(/\s+/g, ' ').trim()
  return text.length > 240 ? `${text.slice(0, 240).trimEnd()}…` : text
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

function formatCount(value: number | undefined): string {
  return value === undefined ? '—' : value.toLocaleString('en-US')
}
