import { afterEach, describe, expect, it } from 'vitest'
import {
  MAX_TRANSIENT_RESULTS,
  clearTransientResults,
  getTransientResult,
  isDemoHistoryId,
  setTransientResult,
} from '#/lib/tools/demoRuns'

function storedDemoKeys(): string[] {
  const keys: string[] = []
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const key = sessionStorage.key(index)
    if (key?.startsWith('cw:demo-result:')) keys.push(key)
  }
  return keys
}

describe('demoRuns', () => {
  afterEach(() => {
    clearTransientResults()
  })

  it('preserves parent_run_id for transient regenerated results', () => {
    const item = setTransientResult(
      'resume',
      {
        generated_at: '2026-04-03T10:00:00Z',
        summary: {
          headline: 'Updated result',
          verdict: 'Promising',
          confidence_note: 'Directional only.',
        },
      },
      'parent-run-123',
    )

    expect(item.parent_run_id).toBe('parent-run-123')
    expect(getTransientResult(item.id)?.parent_run_id).toBe('parent-run-123')
  })

  it('persists guest results to sessionStorage', () => {
    const item = setTransientResult('resume', {
      generated_at: '2026-04-06T12:00:00Z',
      summary: { headline: 'Test', verdict: 'Good', confidence_note: '' },
    })

    const stored = sessionStorage.getItem(`cw:demo-result:${item.id}`)
    expect(stored).toBeTruthy()
    expect(JSON.parse(stored!).id).toBe(item.id)
  })

  it('recovers from sessionStorage after in-memory Map is cleared', () => {
    const item = setTransientResult('job-match', {
      generated_at: '2026-04-06T12:00:00Z',
      summary: { headline: 'Match', verdict: 'Strong', confidence_note: '' },
    })
    const id = item.id

    // Simulate page refresh: clear only the in-memory Map (not sessionStorage)
    // We access the internal map indirectly by clearing and re-checking
    clearTransientResults()

    // Re-persist to sessionStorage to simulate the refresh scenario
    // (clearTransientResults also cleans sessionStorage, so re-store it)
    sessionStorage.setItem(`cw:demo-result:${id}`, JSON.stringify(item))

    const recovered = getTransientResult(id)
    expect(recovered).not.toBeNull()
    expect(recovered!.id).toBe(id)
    expect(recovered!.tool_name).toBe('job-match')
  })

  it('isDemoHistoryId round-trips with setTransientResult and rejects real history ids', () => {
    const item = setTransientResult('job-match', {
      generated_at: '2026-04-29T08:00:00Z',
      summary: { headline: 'Demo', verdict: 'Strong', confidence_note: '' },
    })

    expect(isDemoHistoryId(item.id)).toBe(true)
    expect(isDemoHistoryId('cf2e8b6d-4a25-4c8a-9f3e-2c1f7a9d6b4c')).toBe(false)
    expect(isDemoHistoryId('not-a-demo-id')).toBe(false)
  })

  it('cleans up sessionStorage entries on clearTransientResults', () => {
    const item1 = setTransientResult('resume', {
      generated_at: '2026-04-06T12:00:00Z',
      summary: { headline: 'A', verdict: 'B', confidence_note: '' },
    })
    const item2 = setTransientResult('career', {
      generated_at: '2026-04-06T12:00:00Z',
      summary: { headline: 'C', verdict: 'D', confidence_note: '' },
    })

    expect(sessionStorage.getItem(`cw:demo-result:${item1.id}`)).toBeTruthy()
    expect(sessionStorage.getItem(`cw:demo-result:${item2.id}`)).toBeTruthy()

    clearTransientResults()

    expect(sessionStorage.getItem(`cw:demo-result:${item1.id}`)).toBeNull()
    expect(sessionStorage.getItem(`cw:demo-result:${item2.id}`)).toBeNull()
  })

  it('gives every guest run a distinct id even within the same millisecond', () => {
    const ids = new Set(
      Array.from({ length: 5 }, () =>
        setTransientResult('resume', {
          generated_at: '2026-04-06T12:00:00Z',
          summary: { headline: 'Same tick', verdict: 'B', confidence_note: '' },
        }).id,
      ),
    )

    expect(ids.size).toBe(5)
  })

  it('caps retained guest results and evicts the oldest first', () => {
    const overflow = 3
    const created = Array.from({ length: MAX_TRANSIENT_RESULTS + overflow }, (_unused, index) =>
      setTransientResult('resume', {
        generated_at: '2026-04-06T12:00:00Z',
        summary: {
          headline: `Run ${index}`,
          verdict: 'B',
          confidence_note: 'private resume text',
        },
      }),
    )

    expect(storedDemoKeys()).toHaveLength(MAX_TRANSIENT_RESULTS)

    const evicted = created.slice(0, overflow)
    const retained = created.slice(overflow)

    for (const item of evicted) {
      expect(sessionStorage.getItem(`cw:demo-result:${item.id}`)).toBeNull()
      expect(getTransientResult(item.id)).toBeNull()
    }

    for (const item of retained) {
      expect(sessionStorage.getItem(`cw:demo-result:${item.id}`)).toBeTruthy()
      expect(getTransientResult(item.id)?.id).toBe(item.id)
    }
  })

  it('prunes guest results left in storage by an earlier page load', () => {
    const stale = Array.from({ length: MAX_TRANSIENT_RESULTS }, (_unused, index) => {
      const id = `resume-demo-${1_000 + index}`
      sessionStorage.setItem(
        `cw:demo-result:${id}`,
        JSON.stringify({ id, result_payload: { resume: 'private' } }),
      )
      return id
    })

    const fresh = setTransientResult('career', {
      generated_at: '2026-04-06T12:00:00Z',
      summary: { headline: 'Fresh', verdict: 'B', confidence_note: '' },
    })

    expect(storedDemoKeys()).toHaveLength(MAX_TRANSIENT_RESULTS)
    expect(sessionStorage.getItem(`cw:demo-result:${stale[0]}`)).toBeNull()
    expect(sessionStorage.getItem(`cw:demo-result:${fresh.id}`)).toBeTruthy()
  })

  it('cleans up persisted results that are not present in memory after reload', () => {
    sessionStorage.setItem(
      'cw:demo-result:resume-demo-123',
      JSON.stringify({ id: 'resume-demo-123', result_payload: { resume: 'private' } }),
    )

    clearTransientResults()

    expect(sessionStorage.getItem('cw:demo-result:resume-demo-123')).toBeNull()
  })
})
