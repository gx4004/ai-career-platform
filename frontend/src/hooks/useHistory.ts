import { useQuery } from '@tanstack/react-query'
import type { HistoryQueryParams } from '#/lib/api/client'
import { getHistory } from '#/lib/api/client'

export function useHistory(
  params: HistoryQueryParams,
  enabled = true,
) {
  return useQuery({
    queryKey: [
      'history-page',
      params.tool || '',
      String(params.favorite ?? ''),
      params.q || '',
      params.page || 1,
      params.page_size || 12,
    ],
    queryFn: () => getHistory(params),
    enabled,
  })
}
