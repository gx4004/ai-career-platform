import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { flushLetterEdits, useLetterAutosave } from '#/components/tooling/ResultParts'
import type { LetterDraft } from '#/components/tooling/ResultParts'

const request = vi.hoisted(() => vi.fn())
vi.mock('#/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/api/client')>()),
  request,
}))

// The PDF export of an edited cover letter calls flushLetterEdits(runId) and then renders what the server
// holds, so the flush may only return once the server holds the latest edit.
const RUN = 'run-letter-1'
const ORIGINAL: LetterDraft = { opening: 'Dear team,', body: ['I build APIs.'], closing: 'Best, Ada' }
const EDITED: LetterDraft = { ...ORIGINAL, body: ['I build fast APIs.'] }

function deferred() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function renderAutosave() {
  return renderHook(({ draft, edited }) => useLetterAutosave(RUN, draft, edited, true), {
    initialProps: { draft: ORIGINAL, edited: false },
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  request.mockReset()
  window.sessionStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('flushLetterEdits', () => {
  it('waits for an autosave already on its way before it returns', async () => {
    const patch = deferred()
    request.mockReturnValueOnce(patch.promise)
    const hook = renderAutosave()
    hook.rerender({ draft: EDITED, edited: true })
    // The autosave fires and its PATCH is still in flight.
    await act(() => vi.advanceTimersByTimeAsync(1_000))
    expect(request).toHaveBeenCalledOnce()

    let flushed = false
    const flush = flushLetterEdits(RUN).then(() => {
      flushed = true
    })
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(flushed).toBe(false)

    await act(async () => {
      patch.resolve()
      await flush
    })
    expect(flushed).toBe(true)
    expect(hook.result.current).toBe('saved')
    hook.unmount()
  })

  it('retries an autosave that failed, so the export gets the edited letter', async () => {
    request.mockRejectedValueOnce(Object.assign(new Error('down'), { status: 503 })).mockResolvedValueOnce(undefined)
    const hook = renderAutosave()
    hook.rerender({ draft: EDITED, edited: true })
    await act(() => vi.advanceTimersByTimeAsync(1_000))
    expect(request).toHaveBeenCalledOnce()
    expect(hook.result.current).toBe('error')

    await act(() => flushLetterEdits(RUN))

    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[1]).toEqual([
      `/history/${RUN}/letter`,
      { method: 'PATCH', body: { opening: 'Dear team,', body_points: ['I build fast APIs.'], closing: 'Best, Ada' } },
    ])
    expect(hook.result.current).toBe('saved')
    hook.unmount()
  })

  it('does not write anything when the letter was never edited', async () => {
    const hook = renderAutosave()
    await act(() => flushLetterEdits(RUN))
    expect(request).not.toHaveBeenCalled()
    hook.unmount()
    expect(request).not.toHaveBeenCalled()
  })
})
