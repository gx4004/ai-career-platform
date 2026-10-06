import { useQuery } from '@tanstack/react-query'
import { getToday } from '#/lib/api/client'
import { useAccountQueriesEnabled } from '#/hooks/useAccountQueriesEnabled'

// Under the applications prefix so any application write refreshes it.
export const TODAY_QUERY_KEY = ['applications', 'today'] as const

/** The Today query (key and fetch), shared by the hook and the dashboard's route loader. */
export const todayQuery = () => ({ queryKey: TODAY_QUERY_KEY, queryFn: getToday, staleTime: 15_000 })

export function useToday() {
  return useQuery({
    ...todayQuery(),
    enabled: useAccountQueriesEnabled(),
  })
}
