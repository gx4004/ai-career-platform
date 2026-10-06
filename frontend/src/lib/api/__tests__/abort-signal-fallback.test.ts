import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetRefreshState, request } from '#/lib/api/client'
import { ApiError } from '#/lib/api/errors'

// Safari before 17.4 (iOS 16) has neither AbortSignal.any nor, before 16, AbortSignal.timeout. Calling the
// missing one threw a TypeError inside the request, so every tool run read as "Can't reach the server".
const original = { any: AbortSignal.any, timeout: AbortSignal.timeout }
const mockFetch = vi.fn()

function json(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    clone() {
      return this
    },
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  }
}

/** A fetch that answers only when told to, and rejects the way browsers do when its signal aborts. */
function pendingFetch() {
  let signal: AbortSignal | undefined
  mockFetch.mockImplementationOnce((_url: string, init: RequestInit) => {
    signal = init.signal ?? undefined
    return new Promise((_resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason)
      signal?.addEventListener('abort', () => reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')))
    })
  })
  return () => signal
}

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
  window.localStorage.clear()
  __resetRefreshState()
  Object.defineProperty(AbortSignal, 'any', { value: undefined, configurable: true, writable: true })
})

afterEach(() => {
  Object.defineProperty(AbortSignal, 'any', { value: original.any, configurable: true, writable: true })
  Object.defineProperty(AbortSignal, 'timeout', { value: original.timeout, configurable: true, writable: true })
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('requests in a browser without AbortSignal.any', () => {
  it('a tool request with a cancel signal still completes', async () => {
    mockFetch.mockResolvedValueOnce(json({ history_id: 'r1' }))
    const controller = new AbortController()

    const result = await request<{ history_id: string }>('/resume/analyze', {
      method: 'POST',
      body: { resume_text: 'x' },
      signal: controller.signal,
    })

    expect(result).toEqual({ history_id: 'r1' })
    expect(mockFetch).toHaveBeenCalledOnce()
    expect(mockFetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  it('cancelling the caller signal still aborts the fetch', async () => {
    const fetchSignal = pendingFetch()
    const controller = new AbortController()

    const pending = request('/resume/analyze', { method: 'POST', body: {}, signal: controller.signal })
    await vi.waitFor(() => expect(fetchSignal()).toBeDefined())
    expect(fetchSignal()?.aborted).toBe(false)

    controller.abort(new DOMException('Cancelled by the user', 'AbortError'))

    await expect(pending).rejects.toBeInstanceOf(ApiError)
    expect(fetchSignal()?.aborted).toBe(true)
    expect((fetchSignal()?.reason as DOMException).name).toBe('AbortError')
  })

  it('a caller signal that was already aborted aborts the fetch at once', async () => {
    const fetchSignal = pendingFetch()
    const controller = new AbortController()
    controller.abort()

    await expect(request('/resume/analyze', { method: 'POST', body: {}, signal: controller.signal })).rejects.toBeInstanceOf(
      ApiError,
    )
    expect(fetchSignal()?.aborted).toBe(true)
  })

  it('the timeout still aborts the fetch, also without AbortSignal.timeout, and reads as a timeout', async () => {
    Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true, writable: true })
    vi.useFakeTimers()
    const fetchSignal = pendingFetch()
    const controller = new AbortController()

    const pending = request('/resume/analyze', { method: 'POST', body: {}, signal: controller.signal, timeoutMs: 5_000 })
    const outcome = pending.catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(5_001)

    const error = await outcome
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toMatch(/took too long|timed out|too long/i)
    expect(fetchSignal()?.aborted).toBe(true)
    expect((fetchSignal()?.reason as DOMException).name).toBe('TimeoutError')
  })
})
