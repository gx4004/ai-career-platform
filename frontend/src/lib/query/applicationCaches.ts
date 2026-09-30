import type { QueryClient } from '@tanstack/react-query'

const ROOT = 'applications'

export const APPLICATION_BOARD_QUERY_KEY = [ROOT, 'board'] as const
export const APPLICATION_INSIGHTS_QUERY_KEY = [ROOT, 'insights'] as const
export const APPLICATION_PREFERENCES_QUERY_KEY = [ROOT, 'preferences'] as const
export const APPLICATION_DETAILS_QUERY_KEY = [ROOT, 'details'] as const

export function applicationQueryKey(applicationId: string) {
  return [ROOT, 'detail', applicationId] as const
}

/** After any application write: the board, open application pages and History's workspace list. */
export function invalidateApplications(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: [ROOT] }),
    queryClient.invalidateQueries({ queryKey: ['history-workspaces'] }),
  ])
}
