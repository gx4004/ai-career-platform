import { useMutation, useQueryClient } from '@tanstack/react-query'
import { setHistoryFavorite } from '#/lib/api/client'

export function useFavoriteToggle() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      historyId,
      isFavorite,
    }: {
      historyId: string
      isFavorite: boolean
    }) => setHistoryFavorite(historyId, isFavorite),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['history-page'] })
      void queryClient.invalidateQueries({
        queryKey: ['tool-run', variables.historyId],
      })
    },
  })
}
