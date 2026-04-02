import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captureAppError, trackTelemetry } from '#/lib/telemetry/client'

describe('telemetry client', () => {
  const fetchMock = vi.fn()
  const sendBeaconMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(window.navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeaconMock,
    })
    sendBeaconMock.mockReset()
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses sendBeacon when available', () => {
    sendBeaconMock.mockReturnValue(true)

    trackTelemetry({
      event_name: 'result_page_loaded',
      tool_id: 'resume',
      access_mode: 'guest_demo',
    })

    expect(sendBeaconMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to fetch when sendBeacon is unavailable', async () => {
    Object.defineProperty(window.navigator, 'sendBeacon', {
      configurable: true,
      value: undefined,
    })
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }))

    trackTelemetry({
      event_name: 'workspace_resumed',
      workspace_id: 'ws_1',
    })

    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports frontend errors without throwing', () => {
    sendBeaconMock.mockReturnValue(true)

    expect(() =>
      captureAppError(new Error('render failed'), {
        source: 'error-boundary',
      }),
    ).not.toThrow()

    expect(sendBeaconMock).toHaveBeenCalledTimes(1)
  })
})
