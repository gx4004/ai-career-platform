import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
    get length() {
      return Object.keys(store).length
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

const KEY = 'career-workbench:pending-intent'

const {
  clearPendingIntent,
  readPendingIntent,
  writePendingIntent,
} = await import('#/lib/auth/pendingIntent')

describe('pendingIntent', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    localStorageMock.clear()
  })

  it('returns null when no intent is stored', () => {
    expect(readPendingIntent()).toBeNull()
  })

  it('round-trips an intent through write and read', () => {
    vi.setSystemTime(new Date('2026-04-17T12:00:00Z'))
    writePendingIntent({
      to: '/resume',
      reason: 'tool',
      toolId: 'resume',
      label: 'Resume Analyzer',
      createdAt: Date.now(),
    })

    const read = readPendingIntent()
    expect(read?.to).toBe('/resume')
    expect(read?.toolId).toBe('resume')
    expect(read?.label).toBe('Resume Analyzer')
  })

  it('returns null and clears storage when the stored intent has expired', () => {
    vi.setSystemTime(new Date('2026-04-17T12:00:00Z'))
    writePendingIntent({ to: '/resume', createdAt: Date.now() })
    // 10-minute TTL + 1 second
    vi.setSystemTime(new Date('2026-04-17T12:10:01Z'))

    expect(readPendingIntent()).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('clearPendingIntent removes the intent', () => {
    writePendingIntent({ to: '/resume', createdAt: Date.now() })
    clearPendingIntent()
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})
