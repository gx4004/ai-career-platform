import type { QueryKey } from '@tanstack/react-query'
import { historyPageQuery } from '#/hooks/useHistory'
import { todayQuery } from '#/hooks/useToday'
import {
  getApplicationInsights,
  getHistoryItem,
  listApplications,
  listCvDocuments,
} from '#/lib/api/client'
import type { HistoryQueryParams } from '#/lib/api/client'
import { getBreakpoint } from '#/hooks/use-breakpoint'
import { hasSessionHint } from '#/lib/auth/sessionHint'
import { APPLICATION_BOARD_QUERY_KEY, APPLICATION_INSIGHTS_QUERY_KEY } from '#/lib/query/applicationCaches'
import { DEFAULT_DISCOVERY_PARAMS, discoveryListingsQuery } from '#/lib/query/discoveryQueries'
import { queryClient } from '#/lib/query/queryClient'
import { isDemoHistoryId } from '#/lib/tools/demoRuns'

/*
 * Route-level warming of a page's first-screen data. Route loaders and guards call these without waiting:
 * on a hover (Link preload="intent") the data starts loading before the click, and on a navigation it
 * loads in parallel with the page's code and with /auth/me instead of after them. The pages read the very
 * same queries (same keys and fetches), so whatever arrived is shown at once.
 *
 * Only in a browser that held a session recently: a guest has no account data to fetch, and the server
 * render has no cookies. A stale hint degrades to what the page did before: the failed query is dropped
 * (unless a page is already watching it) and the page asks again itself.
 */

type Warmable = { queryKey: QueryKey; queryFn: () => Promise<unknown>; staleTime?: number }

function canWarm() {
  return typeof window !== 'undefined' && hasSessionHint()
}

function warm(options: Warmable) {
  void queryClient.prefetchQuery(options).then(() => {
    const query = queryClient.getQueryCache().find({ queryKey: options.queryKey, exact: true })
    if (query?.state.status === 'error' && query.getObserversCount() === 0) {
      queryClient.removeQueries({ queryKey: options.queryKey, exact: true })
    }
  })
}

/** /dashboard: Today, the pipeline, the CV row and recent activity. */
export function warmDashboard() {
  if (!canWarm()) return
  warm(todayQuery())
  warm({ queryKey: APPLICATION_BOARD_QUERY_KEY, queryFn: listApplications })
  warm({ queryKey: APPLICATION_INSIGHTS_QUERY_KEY, queryFn: getApplicationInsights })
  warm({ queryKey: ['cv-studio', 'list'], queryFn: listCvDocuments })
  warm(historyPageQuery({ tool: 'resume', page: 1, page_size: 1 }))
  // Recent activity shows three runs on phones, five elsewhere (dashboard-page.tsx).
  warm(historyPageQuery({ page: 1, page_size: getBreakpoint() === 'mobile' ? 3 : 5 }))
}

/** /history with its search: the page of runs it opens on. */
export function warmHistory(search: HistoryQueryParams, defaultPageSize: number) {
  if (!canWarm()) return
  warm(
    historyPageQuery({
      tool: search.tool,
      q: search.q,
      favorite: search.favorite ? true : undefined,
      page: search.page ?? 1,
      page_size: search.page_size ?? defaultPageSize,
    }),
  )
}

/** /discovery: the first page of listings with the default filters. */
export function warmDiscovery() {
  if (!canWarm()) return
  warm(discoveryListingsQuery(DEFAULT_DISCOVERY_PARAMS, 1))
}

/** /campaigns: the application board and its What's working panel. */
export function warmApplications() {
  if (!canWarm()) return
  warm({ queryKey: APPLICATION_BOARD_QUERY_KEY, queryFn: listApplications })
  warm({ queryKey: APPLICATION_INSIGHTS_QUERY_KEY, queryFn: getApplicationInsights })
}

/** /<tool>/result/:id: a saved run (a guest demo lives in this tab's memory and is never fetched). */
export function warmToolRun(historyId: string) {
  if (!canWarm() || isDemoHistoryId(historyId)) return
  if (queryClient.getQueryData(['tool-run', historyId])) return
  warm({ queryKey: ['tool-run', historyId], queryFn: () => getHistoryItem(historyId) })
}
