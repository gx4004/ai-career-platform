import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CinematicLoader } from '#/components/tooling/CinematicLoader'

const trackTelemetryMock = vi.hoisted(() => vi.fn())
vi.mock('#/lib/telemetry/client', () => ({ trackTelemetry: trackTelemetryMock }))

function progressValue(container: HTMLElement) {
  const root = container.querySelector('.cinematic-loader') as HTMLElement | null
  if (!root) return null
  const raw = root.getAttribute('data-progress')
  return raw ? Number(raw) : null
}

describe('CinematicLoader', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    trackTelemetryMock.mockReset()
  })

  it('reports one bounded abandonment when a pending loader leaves the page', () => {
    render(
      <CinematicLoader toolId="resume" accessMode="guest_demo" mutationDone={false} />,
    )
    act(() => vi.advanceTimersByTime(1500))
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })

    expect(trackTelemetryMock).toHaveBeenCalledWith({
      event_name: 'generation_loader_abandoned',
      tool_id: 'resume',
      access_mode: 'guest_demo',
      duration_ms: 1500,
    })
    expect(trackTelemetryMock).toHaveBeenCalledTimes(1)
  })

  it('does not report abandonment when a completed run unmounts the loader', () => {
    // Every tool page renders `{mutation.isPending ? <loader/> : <result/>}`, so
    // `mutationDone` is structurally false for the loader's whole lifetime and the
    // success path is an unmount. Reporting here would mark every run abandoned.
    const { unmount } = render(
      <CinematicLoader toolId="resume" mutationDone={false} />,
    )
    act(() => vi.advanceTimersByTime(12_000))
    unmount()
    expect(trackTelemetryMock).not.toHaveBeenCalled()
  })

  it('does not report abandonment for a leave under one second', () => {
    render(<CinematicLoader toolId="resume" mutationDone={false} />)
    act(() => vi.advanceTimersByTime(400))
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(trackTelemetryMock).not.toHaveBeenCalled()
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
