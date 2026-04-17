import { afterEach, beforeEach, describe, expect, it } from 'vitest'

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

const {
  CONSENT_STORAGE_KEY,
  clearStoredConsent,
  getStoredConsent,
  hasAnalyticsConsent,
  setStoredConsent,
} = await import('#/lib/consent')

describe('consent', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  afterEach(() => {
    localStorageMock.clear()
  })

  it('returns pending when nothing is stored', () => {
    expect(getStoredConsent()).toBe('pending')
    expect(hasAnalyticsConsent()).toBe(false)
  })

  it('round-trips accepted through setStoredConsent + getStoredConsent', () => {
    setStoredConsent('accepted')
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('accepted')
    expect(getStoredConsent()).toBe('accepted')
    expect(hasAnalyticsConsent()).toBe(true)
  })

  it('round-trips rejected through setStoredConsent + getStoredConsent', () => {
    setStoredConsent('rejected')
    expect(getStoredConsent()).toBe('rejected')
    expect(hasAnalyticsConsent()).toBe(false)
  })

  it('treats garbage values as pending', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'not-a-valid-consent-value')
    expect(getStoredConsent()).toBe('pending')
  })

  it('clearStoredConsent removes the key', () => {
    setStoredConsent('accepted')
    clearStoredConsent()
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull()
    expect(getStoredConsent()).toBe('pending')
  })
})
