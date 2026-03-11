import { createFileRoute } from '@tanstack/react-router'
import { HistoryPage } from '#/components/history/HistoryPage'

type HistorySearch = {
  tool?: string
  favorite?: boolean
  q?: string
  page?: number
  page_size?: number
}

export const Route = createFileRoute('/history')({
  head: () => ({
    meta: [{ title: 'History | Career Workbench' }],
  }),
  validateSearch: (search): HistorySearch => ({
    tool: typeof search.tool === 'string' ? search.tool : undefined,
    favorite:
      search.favorite === true ||
      search.favorite === 'true' ||
      search.favorite === '1',
    q: typeof search.q === 'string' ? search.q : undefined,
    page: typeof search.page === 'string' ? Number(search.page) || 1 : undefined,
    page_size:
      typeof search.page_size === 'string'
        ? Number(search.page_size) || 12
        : undefined,
  }),
  component: HistoryRoute,
})

function HistoryRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

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
