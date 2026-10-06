import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSessionHint, hasSessionHint, markSessionHint } from '#/lib/auth/sessionHint'

describe('session hint', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-06T10:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('is absent in a browser that never signed in', () => {
    expect(hasSessionHint()).toBe(false)
  })

  it('is present after a sign-in and gone after clearing', () => {
    markSessionHint()
    expect(hasSessionHint()).toBe(true)
    clearSessionHint()
    expect(hasSessionHint()).toBe(false)
  })

  it('lapses with the 7-day refresh cookie it stands for', () => {
    markSessionHint()
    vi.setSystemTime(new Date('2026-10-12T10:00:00Z'))
    expect(hasSessionHint()).toBe(true)
    vi.setSystemTime(new Date('2026-10-14T10:00:00Z'))
    expect(hasSessionHint()).toBe(false)
  })

  it('treats a blocked or broken storage as "no session" without throwing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    })
    expect(() => markSessionHint()).not.toThrow()
    expect(hasSessionHint()).toBe(false)
    expect(() => clearSessionHint()).not.toThrow()
  })
})
