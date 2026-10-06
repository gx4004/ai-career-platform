import { describe, expect, it } from 'vitest'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { Route as HistoryRoute } from '#/routes/history'

// Real router round trip: TanStack's default search parser hands numbers to
// validateSearch (`?page=2` -> 2), which is exactly what broke pagination.
function makeRouter(initial: string) {
  const options = HistoryRoute.options as unknown as {
    validateSearch: (search: Record<string, unknown>) => Record<string, unknown>
    search: { middlewares: Array<never> }
  }
  const rootRoute = createRootRoute()
  const historyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/history',
    validateSearch: options.validateSearch,
    search: options.search,
    component: () => null,
  })
  const history = createMemoryHistory({ initialEntries: [initial] })
  const router = createRouter({ routeTree: rootRoute.addChildren([historyRoute]), history })
  return { router, history }
}

function historySearch(router: ReturnType<typeof makeRouter>['router']) {
  const match = router.state.matches.find((m) => m.routeId === '/history')
  return match?.search as Record<string, unknown>
}

describe('/history search params', () => {
  it('reads page, page_size and a digit-only q from the URL', async () => {
    const { router } = makeRouter('/history?page=2&page_size=10&q=2026')
    await router.load()
    expect(historySearch(router)).toMatchObject({ page: 2, page_size: 10, q: '2026' })
  })

  it('clamps a nonsense page to 1 and caps page_size', async () => {
    const { router } = makeRouter('/history?page=-4&page_size=900')
    await router.load()
    expect(historySearch(router)).toMatchObject({ page: 1, page_size: 50 })
  })

  it('still accepts quoted strings from older links', async () => {
    const { router } = makeRouter('/history?page=%223%22&q=%222026%22')
    await router.load()
    expect(historySearch(router)).toMatchObject({ page: 3, q: '2026' })
  })

  it('writes ?page=2 on Next and a plain numeric q, and reads them back', async () => {
    const { router, history } = makeRouter('/history')
    await router.load()
    await router.navigate({ to: '/history', search: { q: '2026', page: 2 } } as never)
    expect(history.location.search).toBe('?q=2026&page=2')
    expect(historySearch(router)).toMatchObject({ page: 2, q: '2026' })
  })

  it('keeps a text query a string', async () => {
    const { router, history } = makeRouter('/history')
    await router.load()
    await router.navigate({ to: '/history', search: { q: 'senior engineer' } } as never)
    expect(historySearch(router)).toMatchObject({ q: 'senior engineer' })
    expect(history.location.search).not.toContain('%22')
  })
})
