import { describe, it, expect, beforeEach, vi } from 'vitest'

// Create a proper localStorage mock since jsdom may not provide one
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

import {
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  readStorageJson,
  writeStorageJson,
  removeStorageValue,
  readSessionJson,
  writeSessionJson,
  removeSessionValue,
} from '#/lib/auth/storage'

beforeEach(() => {
  localStorageMock.clear()
  const ssKeys: string[] = []
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i)
    if (key) ssKeys.push(key)
  }
  for (const key of ssKeys) sessionStorage.removeItem(key)
})

describe('auth storage', () => {
  describe('auth token', () => {
    it('returns null when no token set', () => {
      expect(getAuthToken()).toBeNull()
    })

    it('stores and retrieves token', () => {
      setAuthToken('test-token-123')
      expect(getAuthToken()).toBe('test-token-123')
    })

    it('clears token', () => {
      setAuthToken('token')
      clearAuthToken()
      expect(getAuthToken()).toBeNull()
    })
  })

  describe('localStorage JSON helpers', () => {
    it('returns null for missing key', () => {
      expect(readStorageJson('nonexistent')).toBeNull()
    })

    it('writes and reads JSON', () => {
      writeStorageJson('test-key', { name: 'test', count: 42 })
      const result = readStorageJson<{ name: string; count: number }>('test-key')
      expect(result).toEqual({ name: 'test', count: 42 })
    })

    it('handles invalid JSON gracefully', () => {
      localStorageMock.setItem('bad-json', 'not-valid-json')
      expect(readStorageJson('bad-json')).toBeNull()
    })

    it('removes values', () => {
      writeStorageJson('remove-me', { data: true })
      removeStorageValue('remove-me')
      expect(readStorageJson('remove-me')).toBeNull()
    })
  })

  describe('sessionStorage JSON helpers', () => {
    it('returns null for missing key', () => {
      expect(readSessionJson('nonexistent')).toBeNull()
    })

    it('writes and reads JSON', () => {
      writeSessionJson('session-key', { value: 'session-data' })
      const result = readSessionJson<{ value: string }>('session-key')
      expect(result).toEqual({ value: 'session-data' })
    })

    it('handles invalid JSON gracefully', () => {
      sessionStorage.setItem('bad-session', '{invalid}')
      expect(readSessionJson('bad-session')).toBeNull()
    })

    it('removes values', () => {
      writeSessionJson('remove-session', { data: true })
      removeSessionValue('remove-session')
      expect(readSessionJson('remove-session')).toBeNull()
    })
  })
})
