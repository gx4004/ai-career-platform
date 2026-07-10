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
      tool_id: 'resume',
    })

    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('dispatches the landing_page_viewed event through the shared pipe', () => {
    sendBeaconMock.mockReturnValue(true)

    trackTelemetry({ event_name: 'landing_page_viewed' })

    expect(sendBeaconMock).toHaveBeenCalledTimes(1)
  })

  it('skips landing_page_viewed entirely when cookie consent is declined', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue('rejected'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })
    sendBeaconMock.mockReturnValue(true)

    trackTelemetry({ event_name: 'landing_page_viewed' })

    expect(sendBeaconMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports frontend errors without serializing messages or arbitrary context', async () => {
    sendBeaconMock.mockReturnValue(true)

    expect(() =>
      captureAppError(new Error('render failed for user@example.com?token=secret'), {
        source: 'error-boundary',
      }),
    ).not.toThrow()

    expect(sendBeaconMock).toHaveBeenCalledTimes(1)
    const blob = sendBeaconMock.mock.calls[0]?.[1] as Blob
    const payload = JSON.parse(await blob.text())
    expect(payload.failure_category).toBe('render_error')
    expect(JSON.stringify(payload)).not.toContain('user@example.com')
    expect(JSON.stringify(payload)).not.toContain('secret')
  })
})
