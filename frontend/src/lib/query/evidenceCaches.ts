import type { QueryClient, QueryKey } from '@tanstack/react-query'

export const EVIDENCE_QUERY_KEY = ['evidence-profile', 'items'] as const
export const DEVELOPMENT_PLAN_QUERY_KEY = ['development-plan', 'items'] as const
export const DISCOVERY_RECOMMENDATIONS_QUERY_KEY = [
  'discovery',
  'recommendations',
] as const

type EvidenceCacheImpact = {
  rankingMayChange: boolean
}

/**
 * Keep the owner-scoped views derived from Evidence Profile state coherent.
 * React Query refetches active warm queries and marks inactive warm queries stale;
 * absent dark-feature queries are not created or fetched by invalidation.
 */
export async function invalidateEvidenceCaches(
  queryClient: QueryClient,
  { rankingMayChange }: EvidenceCacheImpact,
) {
  const queryKeys: QueryKey[] = [
    EVIDENCE_QUERY_KEY,
    DEVELOPMENT_PLAN_QUERY_KEY,
  ]
  if (rankingMayChange) queryKeys.push(DISCOVERY_RECOMMENDATIONS_QUERY_KEY)

  await Promise.all(
    queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  )
}
