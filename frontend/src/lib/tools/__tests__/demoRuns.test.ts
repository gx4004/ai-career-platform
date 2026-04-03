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
})
