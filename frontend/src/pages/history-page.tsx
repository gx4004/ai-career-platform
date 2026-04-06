import '#/styles/history.css'
import { getRouteApi } from '@tanstack/react-router'
import { HistoryPage } from '#/components/history/HistoryPage'

const historyRoute = getRouteApi('/history')

export function HistoryRoutePage() {
  const search = historyRoute.useSearch()
  const navigate = historyRoute.useNavigate()

  return (
    <HistoryPage
      search={search}
      onSearchChange={(next) =>
        navigate({
          search: (current) => ({
            ...current,
            ...next,
          }),
        })
      }
    />
  )
}
