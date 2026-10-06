import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HISTORY_PAGE_SIZE, historyPageQuery } from '#/hooks/useHistory'
import { ApiError } from '#/lib/api/errors'
import { clearSessionHint, markSessionHint } from '#/lib/auth/sessionHint'
import { queryClient } from '#/lib/query/queryClient'
import { warmHistory } from '#/lib/query/routePrefetch'

const getHistoryMock = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/api/client')>()),
  getHistory: getHistoryMock,
}))

const page = { items: [], total: 0, page: 1, page_size: HISTORY_PAGE_SIZE }

describe('route prefetch', () => {
  beforeEach(() => {
    queryClient.clear()
    getHistoryMock.mockReset()
  })
  afterEach(() => clearSessionHint())

  it('fetches nothing in a browser that holds no session', () => {
    warmHistory({}, HISTORY_PAGE_SIZE)
    expect(getHistoryMock).not.toHaveBeenCalled()
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  })

  it('warms the very key History reads for the same search', async () => {
    markSessionHint()
    getHistoryMock.mockResolvedValue(page)
    warmHistory({ tool: 'resume', favorite: true }, HISTORY_PAGE_SIZE)
    // The page's own params for that search (HistoryPage.tsx).
    const pageKey = historyPageQuery({ tool: 'resume', q: undefined, favorite: true, page: 1, page_size: HISTORY_PAGE_SIZE }).queryKey
    await vi.waitFor(() => expect(queryClient.getQueryData(pageKey)).toEqual(page))
  })

  it('drops a failed warm query that nobody is watching, so the page asks again itself', async () => {
    markSessionHint()
    getHistoryMock.mockRejectedValue(new ApiError('Not authenticated', 401))
    warmHistory({}, HISTORY_PAGE_SIZE)
    const key = historyPageQuery({ page: 1, page_size: HISTORY_PAGE_SIZE }).queryKey
    await vi.waitFor(() => expect(getHistoryMock).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(queryClient.getQueryCache().find({ queryKey: key, exact: true })).toBeUndefined())
  })
})
