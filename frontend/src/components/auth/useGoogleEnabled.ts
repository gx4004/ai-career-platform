import { useQuery } from '@tanstack/react-query'
import { getAuthProviders } from '#/lib/api/client'

/**
 * Whether this deployment can sign in with Google: the server lists it in /auth/providers.
 * Shares the session provider's query key, so it is one request. Unknown, loading or failed means no button.
 */
export function useGoogleEnabled(): boolean {
  const providers = useQuery({
    queryKey: ['auth-providers'],
    queryFn: getAuthProviders,
    retry: false,
    staleTime: 5 * 60_000,
  })
  return providers.data?.providers.includes('google') ?? false
}
