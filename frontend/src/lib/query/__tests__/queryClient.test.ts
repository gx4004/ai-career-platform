import { MutationObserver, QueryObserver } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '#/lib/api/errors'
import { queryClient } from '#/lib/query/queryClient'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  queryClient.clear()
  vi.useRealTimers()
})

// Well past TanStack's first retry delay (1 s), without waiting for it in real time.
const PAST_RETRY_DELAY_MS = 5_000

function observeQuery(queryFn: () => Promise<unknown>) {
  const observer = new QueryObserver(queryClient, { queryKey: ['retry-probe', Math.random()], queryFn })
  const unsubscribe = observer.subscribe(() => {})
  return { observer, unsubscribe }
}

describe('shared query client: no wasteful repeats (LLM-6, FE-3)', () => {
  it.each([
    ['a rate limit', new ApiError('Too many attempts.', 429)],
    ['a server error', new ApiError('Something went wrong on our side.', 500)],
    ['a timeout', new ApiError('The server took too long to answer.', 0)],
    ['a validation error', new ApiError('Enter a valid email address.', 422)],
  ])('sends a failed tool run (a POST) once, never a second time on its own after %s', async (_, error) => {
    const submit = vi.fn().mockRejectedValue(error)
    const observer = new MutationObserver(queryClient, { mutationFn: submit })

    await expect(observer.mutate(undefined)).rejects.toBe(error)
    await vi.advanceTimersByTimeAsync(PAST_RETRY_DELAY_MS)

    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('does not repeat a read the server answered with a 4xx', async () => {
    const read = vi.fn().mockRejectedValue(new ApiError('Not found', 404))
    const { observer, unsubscribe } = observeQuery(read)

    await vi.advanceTimersByTimeAsync(PAST_RETRY_DELAY_MS)

    expect(observer.getCurrentResult().isError).toBe(true)

    expect(read).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('tries a read once more after a dropped connection or a 5xx', async () => {
    const read = vi.fn().mockRejectedValueOnce(new ApiError("Can't reach the server.", 0)).mockResolvedValue({ ok: true })
    const { observer, unsubscribe } = observeQuery(read)

    await vi.advanceTimersByTimeAsync(PAST_RETRY_DELAY_MS)

    expect(observer.getCurrentResult().data).toEqual({ ok: true })

    expect(read).toHaveBeenCalledTimes(2)
    unsubscribe()
  })
})
