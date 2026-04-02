import { useQuery } from '@tanstack/react-query'
import { getHistoryWorkspaces } from '#/lib/api/client'
import { useSession } from '#/hooks/useSession'

export function useWorkspaces() {
  const { status } = useSession()

  return useQuery({
    queryKey: ['history-workspaces'],
    queryFn: async () => {
      const data = await getHistoryWorkspaces()
      return data.items
    },
    enabled: status === 'authenticated',
    staleTime: 30_000,
  })
}
