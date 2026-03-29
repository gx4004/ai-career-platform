import { useQuery } from '@tanstack/react-query'
import { useSession } from '#/hooks/useSession'

interface WorkspaceSummary {
  id: string
  label: string | null
  is_pinned: boolean
}

export function useWorkspaces() {
  const { status } = useSession()

  return useQuery({
    queryKey: ['workspaces'],
    queryFn: async (): Promise<WorkspaceSummary[]> => {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/history/workspaces`, {
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem('auth_token')}`,
        },
      })
      if (!res.ok) return []
      const data = await res.json()
      return data.workspaces ?? data ?? []
    },
    enabled: status === 'authenticated',
    staleTime: 30_000,
  })
}
