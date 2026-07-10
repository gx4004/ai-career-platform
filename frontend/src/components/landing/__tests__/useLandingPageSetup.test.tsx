import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLandingPageSetup } from '#/components/landing/useLandingPageSetup'

const trackTelemetryMock = vi.hoisted(() => vi.fn())

vi.mock('#/lib/telemetry/client', () => ({
  trackTelemetry: trackTelemetryMock,
}))

describe('useLandingPageSetup — landing_page_viewed telemetry (D-040)', () => {
  beforeEach(() => {
    trackTelemetryMock.mockReset()
    Object.defineProperty(window, 'scrollTo', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    document.body.className = ''
  })

  it('fires landing_page_viewed exactly once per landing page view', () => {
    renderHook(() => useLandingPageSetup())

    const landingViews = trackTelemetryMock.mock.calls.filter(
      (call) => call[0]?.event_name === 'landing_page_viewed',
    )
    expect(landingViews).toHaveLength(1)
    expect(landingViews[0][0]).toEqual({ event_name: 'landing_page_viewed' })
  })

  it('does not re-fire across re-renders of the same view', () => {
    const { rerender } = renderHook(() => useLandingPageSetup())
    rerender()
    rerender()

    expect(
      trackTelemetryMock.mock.calls.filter(
        (call) => call[0]?.event_name === 'landing_page_viewed',
      ),
    ).toHaveLength(1)
  })
})
