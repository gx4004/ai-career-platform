import { useQuery } from '@tanstack/react-query'
import { getToday } from '#/lib/api/client'
import { useSession } from '#/hooks/useSession'

// Under the applications prefix so any application write refreshes it.
export const TODAY_QUERY_KEY = ['applications', 'today'] as const

export function useToday() {
  const { status } = useSession()
  return useQuery({
    queryKey: TODAY_QUERY_KEY,
    queryFn: getToday,
    enabled: status === 'authenticated',
    staleTime: 15_000,
  })
}
