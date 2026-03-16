import { describe, it, expect, beforeEach } from 'vitest'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
    get length() { return Object.keys(store).length },
    key: (i: number) => Object.keys(store)[i] ?? null,
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true })

import { isOnboardingComplete, clearOnboarding } from '#/hooks/useOnboarding'

const ONBOARDING_KEY = 'cw:onboarding'

beforeEach(() => {
  localStorageMock.clear()
})

describe('onboarding utilities', () => {
  describe('isOnboardingComplete', () => {
    it('returns false when no state stored', () => {
      expect(isOnboardingComplete()).toBe(false)
    })

    it('returns true when completed', () => {
      localStorageMock.setItem(
        ONBOARDING_KEY,
        JSON.stringify({ completed: true, completedAt: Date.now(), skippedAt: null }),
      )
      expect(isOnboardingComplete()).toBe(true)
    })

    it('returns false when not completed', () => {
      localStorageMock.setItem(
        ONBOARDING_KEY,
        JSON.stringify({ completed: false, completedAt: null, skippedAt: null }),
      )
      expect(isOnboardingComplete()).toBe(false)
    })
  })

  describe('clearOnboarding', () => {
    it('removes onboarding state', () => {
      localStorageMock.setItem(
        ONBOARDING_KEY,
        JSON.stringify({ completed: true, completedAt: Date.now(), skippedAt: null }),
      )
      clearOnboarding()
      expect(localStorageMock.getItem(ONBOARDING_KEY)).toBeNull()
    })
  })
})
