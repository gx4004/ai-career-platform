import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

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
    // Only ever "true": an absent filter must not become `favorite=false`,
    // which the API reads as "show only runs that are not starred".
    favorite:
      search.favorite === true ||
      search.favorite === 'true' ||
      search.favorite === '1'
        ? true
        : undefined,
    q: typeof search.q === 'string' ? search.q : undefined,
    page: typeof search.page === 'string' ? Number(search.page) || 1 : undefined,
    page_size:
      typeof search.page_size === 'string'
        ? Number(search.page_size) || 12
        : undefined,
  }),
  component: lazyRouteComponent(() => import('#/pages/history-page'), 'HistoryRoutePage'),
})
