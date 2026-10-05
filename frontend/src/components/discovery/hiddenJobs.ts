import { request } from '#/lib/api/client'
import { hiddenListingPageSchema } from '#/lib/api/schemas'
import { DISCOVERY_RECOMMENDATIONS_QUERY_KEY } from '#/lib/query/evidenceCaches'

/** Under the recommendations prefix, so hiding or restoring a job refreshes it with the job list. */
export const HIDDEN_JOBS_QUERY_KEY = [...DISCOVERY_RECOMMENDATIONS_QUERY_KEY, 'hidden'] as const

/** The jobs the owner hid, newest hidden first (GET /discovery/dismissals). Restore = DELETE the dismissal. */
export const hiddenJobsQuery = () => ({
  queryKey: HIDDEN_JOBS_QUERY_KEY,
  queryFn: () => request('/discovery/dismissals', { method: 'GET', schema: hiddenListingPageSchema }),
  staleTime: 30_000,
  retry: false,
})
