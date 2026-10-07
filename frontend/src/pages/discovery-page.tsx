import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowUpRight, Check, CircleAlert, Compass, EyeOff, FileText, MoreHorizontal, Plus, Search } from 'lucide-react'
import {
  Badge,
  Button,
  Checkbox,
  Cluster,
  Count,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  FitStamp,
  Input,
  KeyValue,
  KeyValueRow,
  List,
  Notice,
  Page,
  PageHeader,
  Pagination,
  Row,
  RowActions,
  RowBody,
  RowLeading,
  RowMeta,
  RowReveal,
  RowSubtitle,
  RowTitle,
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
  startDiscoveryDeepMatch,
  undismissDiscoveryRecommendation,
} from '#/lib/api/client'
import { ApiError } from '#/lib/api/errors'
import type { DiscoveryDeepMatch, DiscoveryListing } from '#/lib/api/schemas'
import { SignInGate } from '#/components/auth/SignInGate'
import { HiddenJobsSheet } from '#/components/discovery/HiddenJobsSheet'
import { hiddenJobsQuery } from '#/components/discovery/hiddenJobs'
import { useAddToApplicationsToast } from '#/components/discovery/useAddToApplications'
import { FitReasons, JobMeta, SkillTally } from '#/components/discovery/JobParts'
import { useBreakpoint } from '#/hooks/use-breakpoint'
import { useSession } from '#/hooks/useSession'
import { invalidateApplications } from '#/lib/query/applicationCaches'
import {
  DISCOVERY_LISTINGS_KEY as LISTINGS_KEY,
  DISCOVERY_PAGE_SIZE as PAGE_SIZE,
  discoveryDetailQuery as detailQuery,
  discoveryListingsQuery as listingsQuery,
  type DiscoverySearchParams as SearchParams,
} from '#/lib/query/discoveryQueries'
import { DISCOVERY_RECOMMENDATIONS_QUERY_KEY } from '#/lib/query/evidenceCaches'
import { writeWorkflowContext } from '#/lib/tools/drafts'

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

/** Discover, for a signed-in person; a guest gets the same in-page sign-in gate as every signed-in-only page. */
export function DiscoveryPage() {
  const { status } = useSession()
  if (status === 'guest') {
    return (
      <SignInGate
        pageTitle="Discover jobs"
        icon={<Compass aria-hidden="true" />}
        title="Sign in to discover jobs"
        description="Open jobs, scored against the skills in your profile. Add the ones you like to Applications."
        to="/discovery"
      />
    )
  }
  return <DiscoveryWorkspace />
}

function DiscoveryWorkspace() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { toast, dismiss } = useToast()
  const announceAdded = useAddToApplicationsToast('discovery-added')
  const resultsRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const pendingScroll = useRef(false)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [openListing, setOpenListing] = useState<DiscoveryListing | null>(null)
  // The drawer keeps showing the job it was showing while it fades out.
  const [drawerListing, setDrawerListing] = useState<DiscoveryListing | null>(null)
  const [checkingId, setCheckingId] = useState<string | null>(null)
  const adopting = useRef(false)
  const [hiddenOpen, setHiddenOpen] = useState(false)
  const [calloutDismissed, setCalloutDismissed] = useState(true)
  useEffect(() => setCalloutDismissed(readCalloutDismissed()), [])
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
    pendingScroll.current = true
  }
  // Back to the top of the results once the new page has rendered (scrolling from the click handler is
  // undone when the list changes height), and focus moves to the list so Next/Previous turning disabled
  // does not drop it on <body>.
  useEffect(() => {
    if (!pendingScroll.current || listings.isPlaceholderData) return
    pendingScroll.current = false
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    resultsRef.current?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    listRef.current?.focus({ preventScroll: true })
  }, [page, listings.isPlaceholderData])

  // The list, its detail drawers and the hidden-jobs list all sit under the recommendations prefix.
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: DISCOVERY_RECOMMENDATIONS_QUERY_KEY })
  }
  const hiddenJobs = useQuery(hiddenJobsQuery())
  const hiddenCount = hiddenJobs.data?.total ?? 0
  const undoHide = useMutation({
    mutationFn: (listingId: string) => undismissDiscoveryRecommendation(listingId),
    onSuccess: refresh,
  })
  // The job the "Hid … Undo" toast is about: restoring that job (and only that one) from Hidden closes it.
  const hiddenToastListingId = useRef<string | null>(null)
  // The row a hide removes takes focus with it (F33): once the list has refreshed without it, focus goes to the job
  // that took its place (or the one before it, or the empty state's next step).
  const refocusAfterHide = useRef<{ listingId: string; index: number } | null>(null)
  const hide = useMutation({
    mutationFn: (listing: DiscoveryListing) => dismissDiscoveryRecommendation(listing.listing_id),
    retry: false,
    onSuccess: (_result, listing) => {
      refocusAfterHide.current = {
        listingId: listing.listing_id,
        index: Math.max(0, (listings.data?.items ?? []).findIndex((item) => item.listing_id === listing.listing_id)),
      }
      if (openListing?.listing_id === listing.listing_id) setOpenListing(null)
      hiddenToastListingId.current = listing.listing_id
      toast({
        id: 'discovery-hidden',
        icon: <EyeOff aria-hidden="true" />,
        title: `Hid “${listing.title}”.`,
        description: 'Find it again under Hidden.',
        duration: null,
        action: { label: 'Undo', onClick: () => undoHide.mutate(listing.listing_id) },
      })
      refresh()
    },
  })
  // After an add or its undo, the control that replaced the one used ("View application", or Add again) takes focus
  // when focus fell with it (to the page, the drawer, or the toast that just closed); never when the person moved on.
  const refocusAdopt = useRef<{ listingId: string; control: 'add' | 'view' } | null>(null)
  const adopt = useMutation({
    mutationFn: (listingId: string) => adoptDiscoveryRecommendation(listingId),
    // A refused or failed request is shown, not repeated behind the person's back.
    retry: false,
    // Stay here, like the dashboard's Add (consistency-F20): several jobs can be added in a row. The row (and the
    // drawer) flip to "View application" at once, and the toast offers the application and Undo.
    onSuccess: ({ application, created }, listingId) => {
      // The list remembers it: coming back shows "Added", never "Add" again.
      queryClient.setQueriesData({ queryKey: LISTINGS_KEY }, (current) => markAdded(current, listingId, application.id))
      void invalidateApplications(queryClient)
      // The Add that was used is gone: focus follows to the "View application" that replaced it (when it was there).
      const active = document.activeElement
      if (!active || active === document.body || active.closest(`[data-adopt-listing="${listingId}"]`) || active.matches('[role="dialog"]')) {
        refocusAdopt.current = { listingId, control: 'view' }
      }
      announceAdded(application, {
        created,
        onUndone: () => {
          queryClient.setQueriesData({ queryKey: LISTINGS_KEY }, (current) => markAdded(current, listingId, null))
          refocusAdopt.current = { listingId, control: 'add' }
          refresh()
        },
      })
    },
  })
  useLayoutEffect(() => {
    const pending = refocusAdopt.current
    if (!pending) return
    // The open drawer is where the add happened; otherwise the row in the list.
    const scope = openListing ? document.querySelector<HTMLElement>('.disc-drawer') : listRef.current
    const target = scope?.querySelector<HTMLElement>(`[data-adopt-listing="${pending.listingId}"][data-adopt-control="${pending.control}"]`)
    if (!target) return
    refocusAdopt.current = null
    const active = document.activeElement
    const free = !active || active === document.body || active.matches('[role="dialog"]') || Boolean(active.closest('.kit-toast'))
    if (free) target.focus()
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
      roleOrigin: 'discover',
      jobOrigin: 'discover',
      jobSource: undefined,
      // Tells CV Studio to open its tailor dialog prefilled on arrival (#324).
      tailorPending: true,
      updatedAt: Date.now(),
    })
    navigate({ to: '/cv-studio' })
  }

  const items = data?.items ?? []
  useEffect(() => {
    const pending = refocusAfterHide.current
    if (!pending || listings.isPlaceholderData || items.some((item) => item.listing_id === pending.listingId)) return
    refocusAfterHide.current = null
    const frame = requestAnimationFrame(() => {
      // Only when focus went with the row: never pull it from wherever the person has since gone.
      if (document.activeElement && document.activeElement !== document.body) return
      const next = items[Math.min(pending.index, items.length - 1)]
      const target = next
        ? [...(listRef.current?.querySelectorAll<HTMLElement>('[data-listing-id]') ?? [])].find((title) => title.dataset.listingId === next.listing_id)
        : resultsRef.current?.querySelector<HTMLElement>('.kit-empty button') ?? listRef.current
      target?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [items, listings.isPlaceholderData])
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
    // One request at a time: a double click must not send a second POST. The mutation state lags a
    // render behind the click, so the guard is a ref.
    onAdopt: (listing) => {
      if (adopting.current) return
      adopting.current = true
      adopt.mutate(listing.listing_id, { onSettled: () => { adopting.current = false } })
    },
    onHide: (listing) => hide.mutate(listing),
    adoptingId: adopt.isPending ? adopt.variables : undefined,
    hidingId: hide.isPending ? hide.variables?.listing_id : undefined,
    deepMatchingId: checkingId ?? (runDeepMatch.isPending ? runDeepMatch.variables?.listing_id : undefined),
    deepMatchFailure,
  }

  const count = data
    ? data.total === 0 && !filtered && hiddenCount > 0
      // Every job is hidden: they are still open, so "0 open jobs" would be false (F40).
      ? `0 to show · ${formatCount(hiddenCount)} hidden`
      : `${formatCount(data.total)} ${filtered ? (data.total === 1 ? 'match' : 'matches') : data.total === 1 ? 'open job' : 'open jobs'}`
        + (data.total > 0 && !hasEvidence ? ' · newest first' : '')
    : listings.isPending ? 'Loading jobs…' : undefined

  const headerAction = (
    <Cluster gap={2} justify="end">
      {hiddenCount > 0 ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          aria-label={`Hidden jobs, ${hiddenCount}`}
          onClick={() => setHiddenOpen(true)}
        >
          <EyeOff aria-hidden="true" /> Hidden <Count value={hiddenCount} />
        </Button>
      ) : null}
      <Button asChild size="sm" variant="secondary"><Link to="/campaigns">My applications</Link></Button>
    </Cluster>
  )
  // Fit scores explained only over jobs to score: with no rows it pushed the empty state below a phone's fold (F40).
  const showCallout = data !== undefined && items.length > 0 && !hasEvidence && !calloutDismissed
  const dismissCallout = () => {
    setCalloutDismissed(true)
    writeCalloutDismissed()
  }

  return (
    <Page>
      <PageHeader title="Discover jobs" actions={headerAction} />

      <Stack gap={3} ref={resultsRef} className="disc-results">
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
                <option value="best_match">Best fit</option>
                <option value="newest">Newest</option>
              </Select>
            ) : undefined
          }
          count={count}
          countPlacement="below"
          activeFilters={activeFilterCount}
          onClearFilters={() => setFilters({ ...EMPTY_FILTERS, q: filters.q })}
        />

        {showCallout ? (
          <Notice
            className="disc-callout"
            title="Add your skills to see fit scores"
            onDismiss={dismissCallout}
            action={<Button asChild size="sm"><Link to="/profile">Open my profile</Link></Button>}
          >
            Confirm your skills in your profile and every job here gets a fit score, with the skills you match and the ones to add.
          </Notice>
        ) : null}
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
              <Skeleton variant="row" as="li" count={PAGE_SIZE} leading="stamp" lines={2} narrowLines={6} trailing="button" />
            </List>
          </>
        ) : listings.isError ? (
          <ErrorState
            icon={<CircleAlert aria-hidden="true" />}
            title="Jobs could not be loaded"
            description="Something went wrong on our side. Your filters are kept."
            onRetry={() => listings.refetch()}
            retrying={listings.isFetching}
          />
        ) : items.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={<Search aria-hidden="true" />}
              title="No jobs match these filters"
              description={`Try fewer words, a wider location, or a longer time range.${hiddenCount > 0 ? ' Jobs you hid are not counted.' : ''}`}
              action={<Button type="button" variant="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>Clear all filters</Button>}
            />
          ) : hiddenCount > 0 ? (
            <EmptyState
              icon={<EyeOff aria-hidden="true" />}
              title="No jobs left to show"
              description={`You hid ${hiddenCount} ${hiddenCount === 1 ? 'job' : 'jobs'}. Restore ${hiddenCount === 1 ? 'it' : 'any'} to see ${hiddenCount === 1 ? 'it' : 'them'} again.`}
              action={<Button type="button" variant="secondary" onClick={() => setHiddenOpen(true)}>Review hidden jobs</Button>}
            />
          ) : (
            <EmptyState
              icon={<Search aria-hidden="true" />}
              title="No jobs yet"
              description="New openings are added every day. Add the ones you like to Applications, where we help you prepare each one."
            />
          )
        ) : (
          <>
            <List ref={listRef} tabIndex={-1} aria-label="Jobs" boxed aria-busy={listings.isPlaceholderData}>
              {items.map((listing) => (
                <JobRow key={listing.listing_id} listing={listing} actions={actions} scored={hasEvidence} selected={openListing?.listing_id === listing.listing_id} />
              ))}
            </List>
            <Pagination page={page} pageCount={lastPage} onPageChange={goToPage} />
          </>
        )}
      </Stack>

      <HiddenJobsSheet
        open={hiddenOpen}
        onOpenChange={setHiddenOpen}
        items={hiddenJobs.data?.items ?? []}
        loading={hiddenJobs.isPending}
        failed={hiddenJobs.isError}
        onRetry={() => void hiddenJobs.refetch()}
        restoringId={undoHide.isPending ? undoHide.variables : undefined}
        onRestore={(job) =>
          undoHide.mutate(job.listing_id, {
            onSuccess: () => {
              // The "Hid … Undo" toast for this same job would now contradict this one; another job's stays.
              if (hiddenToastListingId.current === job.listing_id) {
                hiddenToastListingId.current = null
                dismiss('discovery-hidden')
              }
              toast({ tone: 'success', title: `Restored “${job.title}”.` })
            },
          })
        }
      />

      <Sheet open={openListing !== null} onOpenChange={(open) => { if (!open) setOpenListing(null) }}>
        <SheetContent size="lg" className="disc-drawer">
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

const CALLOUT_KEY = 'cw:discovery-skills-callout'

function readCalloutDismissed(): boolean {
  try {
    return window.localStorage.getItem(CALLOUT_KEY) === '1'
  } catch {
    return false
  }
}

function writeCalloutDismissed() {
  try {
    window.localStorage.setItem(CALLOUT_KEY, '1')
  } catch {
    // Private mode or blocked storage: the callout simply shows again next visit.
  }
}

/** Stamps `application_id` onto the cached page(s) and detail of one listing (`null`: an undone add). */
function markAdded(current: unknown, listingId: string, applicationId: string | null): unknown {
  if (!current || typeof current !== 'object') return current
  const data = current as { items?: DiscoveryListing[]; listing_id?: string }
  if (Array.isArray(data.items)) {
    return { ...data, items: data.items.map((item) => (item.listing_id === listingId ? { ...item, application_id: applicationId } : item)) }
  }
  return data.listing_id === listingId ? { ...data, application_id: applicationId } : current
}

/** Added to Applications: the row says so (the mint "Added" mark in its meta line) and opens it, and never offers Add again. */
function OpenApplication({ listing }: { listing: DiscoveryListing }) {
  if (!listing.application_id) return null
  return (
    <Button asChild size="sm" variant="secondary">
      <Link
        to="/campaigns/$campaignId"
        params={{ campaignId: listing.application_id }}
        aria-label={`View application for ${listing.title}`}
        data-adopt-listing={listing.listing_id}
        data-adopt-control="view"
        // This replaces "Add" the moment the add lands: the second click of a double click on Add must not follow it.
        onClick={(event) => { if (event.detail > 1) event.preventDefault() }}
      >
        View application
      </Link>
    </Button>
  )
}

function JobRow({
  listing,
  actions,
  selected,
  scored,
}: {
  listing: DiscoveryListing
  actions: JobActions
  selected: boolean
  scored: boolean
}) {
  const isMobile = useBreakpoint() === 'mobile'
  const skills = <SkillTally listing={listing} />
  const deepMatching = actions.deepMatchingId === listing.listing_id
  return (
    <Row className="disc-row" selected={selected} aria-current={selected ? 'true' : undefined}>
      {scored ? (
        <RowLeading>
          <FitStamp value={listing.skills_fit} size={isMobile ? 'sm' : 'md'} />
        </RowLeading>
      ) : null}
      <RowBody>
        <RowTitle size="lg" headingLevel={2} asChild>
          <button type="button" data-listing-id={listing.listing_id} onClick={() => actions.onOpen(listing)}>
            {listing.title}
          </button>
        </RowTitle>
        <RowSubtitle>
          <JobMeta listing={listing} source />
        </RowSubtitle>
        <FitReasons listing={listing} />
        {/* Started from the row's menu, which closes at once: the row itself says the match is running (F30). */}
        {deepMatching ? <p className="disc-note" role="status">Running a deep match… this can take up to a minute.</p> : null}
      </RowBody>
      {skills ? <RowMeta>{skills}</RowMeta> : null}
      <RowActions reveal={false}>
        {listing.application_id ? (
          <OpenApplication listing={listing} />
        ) : (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => actions.onAdopt(listing)}
            loading={actions.adoptingId === listing.listing_id}
            aria-label="Add to applications"
            data-adopt-listing={listing.listing_id}
            data-adopt-control="add"
          >
            <Plus aria-hidden="true" />
            Add
          </Button>
        )}
        <RowReveal>
          <JobOverflowMenu listing={listing} actions={actions} withDeepMatch loading={deepMatching} />
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
  loading = false,
}: {
  listing: DiscoveryListing
  actions: JobActions
  /** A job action started from this menu is running: the trigger shows the spinner (and stays in view). */
  loading?: boolean
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
          loading={loading}
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
  // The detail reply is fresher than the list row the drawer was opened from.
  const applicationId = detail.data?.application_id ?? listing.application_id
  const current = { ...listing, application_id: applicationId }
  return (
    <>
      <SheetHeader>
        <SheetTitle>{listing.title}</SheetTitle>
        <SheetDescription asChild>
          <div><JobMeta listing={current} source /></div>
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
        {applicationId ? (
          <Button asChild className="disc-footer__add">
            <Link
              to="/campaigns/$campaignId"
              params={{ campaignId: applicationId }}
              data-adopt-listing={listing.listing_id}
              data-adopt-control="view"
              onClick={(event) => { if (event.detail > 1) event.preventDefault() }}
            >
              <Check aria-hidden="true" /> View application
            </Link>
          </Button>
        ) : (
          <Button
            type="button"
            className="disc-footer__add"
            onClick={() => actions.onAdopt(current)}
            loading={actions.adoptingId === listing.listing_id}
            data-adopt-listing={listing.listing_id}
            data-adopt-control="add"
          >
            Add to applications
          </Button>
        )}
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
          <div className="disc-fit__head">
            <FitStamp value={listing.skills_fit} />
            <div className="disc-fit__text">
              <p className="disc-fit__figure">
                {listing.skills_fit}% skills fit
                <span className="kit-sr-only">{`, ${listing.matched_skills.length} of ${total} skill${total === 1 ? '' : 's'}`}</span>
              </p>
              <SkillTally listing={listing} />
              {listing.fit_confidence === 'low' ? (
                <p className="disc-note">The posting names few skills, so read this score as a rough guide.</p>
              ) : null}
            </div>
          </div>
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
            {listing.skills_fit !== null ? <SkillRow label="Skills you match" items={listing.matched_skills} kind="match" /> : null}
            {listing.skills_fit !== null ? <SkillRow label="Skills to add" items={listing.missing_skills} kind="missing" /> : null}
            <SkillRow label="Matches your preferences" items={listing.preference_hits} kind="preference" />
          </KeyValue>
        ) : null}
      </Stack>
    </Section>
  )
}

/** Matched skills are mint, missing ones rose; the row label says which, so colour is never the only signal. */
function SkillRow({ label, items, kind }: { label: string; items: string[]; kind: 'match' | 'missing' | 'preference' }) {
  if (items.length === 0) return null
  return (
    <KeyValueRow label={label}>
      <Cluster gap={1}>
        {items.map((item) => (
          <Badge key={item} tone={kind === 'match' ? 'mint' : kind === 'missing' ? 'rose' : 'white'}>{item}</Badge>
        ))}
      </Cluster>
    </KeyValueRow>
  )
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US')
}
