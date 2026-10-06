import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { API_URL, __resetRefreshState } from '#/lib/api/client'
import { fetchSessionUser } from '#/lib/auth/currentUser'
import { hasSessionHint } from '#/lib/auth/sessionHint'

// The real client and session read, with only the network stubbed: a browser that lost its session hint
// (cleared storage, another browser profile) while its refresh cookie is still valid.
const mockFetch = vi.fn()

function json(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    clone() {
      return this
    },
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  }
}

const USER = { id: 'u1', email: 'ada@example.com', is_active: true }

function calls() {
  return mockFetch.mock.calls.map(([url, init]) => `${(init?.method ?? 'GET').toUpperCase()} ${String(url).replace(API_URL, '')}`)
}

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
  window.localStorage.clear()
  __resetRefreshState()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchSessionUser without a session hint', () => {
  it('a refreshable session is refreshed once, then read from /auth/me, and the hint is set', async () => {
    mockFetch
      .mockResolvedValueOnce(json({ user: null, refreshable: true }))
      .mockResolvedValueOnce(json({ ok: true }))
      .mockResolvedValueOnce(json(USER))

    const user = await fetchSessionUser()

    expect(user).toMatchObject({ id: 'u1', email: 'ada@example.com' })
    expect(calls()).toEqual(['GET /auth/refresh/session', 'POST /auth/refresh', 'GET /auth/me'])
    expect(hasSessionHint()).toBe(true)
  })

  it('a guest with nothing to refresh is a guest after exactly one request', async () => {
    mockFetch.mockResolvedValueOnce(json({ user: null, refreshable: false }))

    expect(await fetchSessionUser()).toBeNull()
    expect(calls()).toEqual(['GET /auth/refresh/session'])
    expect(hasSessionHint()).toBe(false)
  })

  it('a session read without the refreshable flag (older server) is a guest after one request', async () => {
    mockFetch.mockResolvedValueOnce(json({ user: null }))

    expect(await fetchSessionUser()).toBeNull()
    expect(calls()).toEqual(['GET /auth/refresh/session'])
  })

  it('a refused refresh leaves a guest, with no sign-out event and no hint', async () => {
    const expired = vi.fn()
    window.addEventListener('cw:session-expired', expired)
    mockFetch
      .mockResolvedValueOnce(json({ user: null, refreshable: true }))
      .mockResolvedValueOnce(json({ detail: 'Invalid refresh token' }, 401))

    try {
      expect(await fetchSessionUser()).toBeNull()
    } finally {
      window.removeEventListener('cw:session-expired', expired)
    }
    expect(calls()).toEqual(['GET /auth/refresh/session', 'POST /auth/refresh'])
    expect(hasSessionHint()).toBe(false)
    expect(expired).not.toHaveBeenCalled()
  })

  it('a refresh that cannot be completed (server down) also leaves a guest', async () => {
    mockFetch
      .mockResolvedValueOnce(json({ user: null, refreshable: true }))
      .mockResolvedValueOnce(json({ detail: 'down' }, 503))

    expect(await fetchSessionUser()).toBeNull()
    expect(calls()).toEqual(['GET /auth/refresh/session', 'POST /auth/refresh'])
    expect(hasSessionHint()).toBe(false)
  })

  it('a signed-in session read marks the hint without a refresh', async () => {
    mockFetch.mockResolvedValueOnce(json({ user: USER, refreshable: false }))

    expect(await fetchSessionUser()).toMatchObject({ id: 'u1' })
    expect(calls()).toEqual(['GET /auth/refresh/session'])
    expect(hasSessionHint()).toBe(true)
  })
})
