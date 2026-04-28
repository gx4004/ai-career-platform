import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CinematicLoader } from '#/components/tooling/CinematicLoader'

function progressValue(container: HTMLElement) {
  const root = container.querySelector('.cinematic-loader') as HTMLElement | null
  if (!root) return null
  const raw = root.getAttribute('data-progress')
  return raw ? Number(raw) : null
}

describe('CinematicLoader', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('caps progress at 90% until mutationDone flips, then jumps to 100%', () => {
    const { container, rerender } = render(
      <CinematicLoader toolId="resume" mutationDone={false} />,
    )

    // Resume tool stages sum to ~8s. Advance well past every stage timer so
    // the timer-driven stageIndex would otherwise sit on the final stage.
    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    const cappedProgress = progressValue(container)
    expect(cappedProgress).not.toBeNull()
    expect(cappedProgress!).toBeLessThanOrEqual(90)

    rerender(<CinematicLoader toolId="resume" mutationDone />)

    act(() => {
      // give react a tick to flush the post-mutationDone effect
      vi.advanceTimersByTime(50)
    })

    expect(progressValue(container)).toBe(100)
  })
})
