import { afterEach, describe, expect, it } from 'vitest'
import {
  clearTransientResults,
  getTransientResult,
  setTransientResult,
} from '#/lib/tools/demoRuns'

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
})
