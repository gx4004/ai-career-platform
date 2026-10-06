import { QueryClient } from '@tanstack/react-query'

/** A 4xx is the server's answer; asking again only repeats it (and a 429 spends more of the same limit). */
function retryRead(failureCount: number, error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status
  if (typeof status === 'number' && status >= 400 && status < 500) return false
  return failureCount < 1
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: retryRead,
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Writes and tool runs are not idempotent: a repeat doubles the LLM cost and the rate-limit use, and
      // after a timeout the first run is often still going on the server. The person decides to try again.
      retry: false,
    },
  },
})
