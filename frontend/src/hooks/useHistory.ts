import { useQuery } from '@tanstack/react-query'
import type { HistoryQueryParams } from '#/lib/api/client'
import { getHistory } from '#/lib/api/client'

/** Runs per page on History when the URL does not say. */
export const HISTORY_PAGE_SIZE = 10

/** The History list query (key and fetch), shared by the hook and the route loaders that warm it. */
export function historyPageQuery(params: HistoryQueryParams) {
  return {
    queryKey: [
      'history-page',
      params.tool || '',
      String(params.favorite ?? ''),
      params.q || '',
      params.page || 1,
      params.page_size || 12,
    ],
    queryFn: () => getHistory(params),
  }
}

export function useHistory(
  params: HistoryQueryParams,
  enabled = true,
) {
  return useQuery({
    ...historyPageQuery(params),
    enabled,
  })
}
