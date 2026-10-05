import { act, render, screen } from '@testing-library/react'
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

  it('exposes its in-progress state to assistive technology', () => {
    render(<CinematicLoader toolId="resume" mutationDone={false} />)

    // Asserted by role, not by class name: a sighted-only spinner is exactly the
    // defect this covers.
    const region = screen.getByRole('status')
    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(region.textContent).toContain('Working on your results')
  })

  it('announces a stage change without re-announcing on unrelated renders', () => {
    const { rerender } = render(<CinematicLoader toolId="resume" mutationDone={false} />)

    const region = screen.getByRole('status')
    expect(region.textContent).toContain('Reading your resume')

    // Resume stage 1 lands at 2000ms.
    act(() => {
      vi.advanceTimersByTime(2000)
    })

    // Exactly one live region, and it is the SAME node: a remounted or
    // duplicated live region is what makes screen readers repeat themselves.
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toBe(region)
    expect(region.textContent).toContain('Analyzing sections')

    const afterStageChange = region.textContent
    rerender(<CinematicLoader toolId="resume" mutationDone={false} />)
    rerender(<CinematicLoader toolId="resume" mutationDone={false} />)

    // A re-render that changes no stage must not rewrite the announcement.
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toBe(region)
    expect(region.textContent).toBe(afterStageChange)
  })

  it('presents stage labels as indicative steps, not as server progress', () => {
    const { container } = render(<CinematicLoader toolId="resume" mutationDone={false} />)

    // The visible line frames the rotating step as typical, always rendered.
    expect(container.querySelector('.cinematic-status')?.textContent).toMatch(/typical step/i)

    // Resume stage 2 lands at 4000ms — the former "Calculating score…" slot.
    act(() => {
      vi.advanceTimersByTime(4000)
    })

    const region = screen.getByRole('status')
    expect(region.textContent).toMatch(/typical step/i)
    expect(region.textContent).toContain('Calculating your score')

    // D-056: the client timer must never be presented as server progress.
    expect(container.textContent).not.toMatch(/Calculating score/)
    expect(screen.queryByText('Calculating score…')).toBeNull()
  })

  it('keeps the ellipsis on the visible line only, never in the announcement', () => {
    const { container } = render(<CinematicLoader toolId="resume" mutationDone={false} />)

    // The ellipsis is decoration on the visible (aria-hidden) line only — it is
    // a "more is coming" affordance for sighted users, not a claim of observed
    // server progress. The a11y announcement (D-056) stays ellipsis-free: it
    // already states the substantiated claim explicitly ("Typical step: ...").
    const visibleStage = container.querySelector('.cinematic-status')
    expect(visibleStage?.textContent).toBe(
      'Working on your results… Typical step: Reading your resume…',
    )

    const region = screen.getByRole('status')
    expect(region.textContent).not.toMatch(/…/)
  })

  it('never publishes a determinate progress value the client cannot know', () => {
    const { rerender } = render(<CinematicLoader toolId="resume" mutationDone={false} />)

    const bar = screen.getByRole('progressbar')
    // Indeterminate by construction: the percentage comes from a setTimeout
    // schedule, so aria-valuenow would assert a ratio the client cannot observe.
    expect(bar.getAttribute('aria-valuenow')).toBeNull()
    expect(bar.getAttribute('aria-valuetext')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBeNull()

    rerender(<CinematicLoader toolId="resume" mutationDone />)
    act(() => {
      vi.advanceTimersByTime(50)
    })
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBeNull()
  })

  it('shows the typical steps as a list for the eye only, so the one live region stays the only announcement', () => {
    const { container } = render(<CinematicLoader toolId="resume" mutationDone={false} />)

    const steps = container.querySelector('.cinematic-steps')
    expect(steps?.getAttribute('aria-hidden')).toBe('true')
    expect(steps?.querySelectorAll('li')).toHaveLength(5)
    expect(steps?.querySelector('[data-state="current"]')?.textContent).toContain('Reading your resume')
    expect(screen.getAllByRole('status')).toHaveLength(1)

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    const states = Array.from(steps!.querySelectorAll('li')).map((li) => li.getAttribute('data-state'))
    expect(states).toEqual(['done', 'current', 'upcoming', 'upcoming', 'upcoming'])
  })

  it('fills the track by whole steps and only completes it when the run returns', () => {
    const { container, rerender } = render(<CinematicLoader toolId="resume" mutationDone={false} />)
    const track = () => screen.getByRole('progressbar') as HTMLElement
    expect(track().style.getPropertyValue('--cin-total')).toBe('5')

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(track().style.getPropertyValue('--cin-filled')).toBe('4')

    rerender(<CinematicLoader toolId="resume" mutationDone />)
    act(() => {
      vi.advanceTimersByTime(50)
    })
    expect(track().style.getPropertyValue('--cin-filled')).toBe('5')
    expect(container.querySelectorAll('.cinematic-step[data-state="done"]')).toHaveLength(5)
  })

  it('marks the tool with its tile', () => {
    const { container } = render(<CinematicLoader toolId="job-match" mutationDone={false} />)
    expect(container.querySelector('.cinematic-tile')?.getAttribute('data-tone')).toBe('mint')
  })
})
