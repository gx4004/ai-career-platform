import { afterEach, describe, expect, it, vi } from 'vitest'
import { isR7EntryChoiceEnabled } from '#/lib/flags/featureFlags'

describe('R7 feature flags', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('isR7EntryChoiceEnabled (dark-ship default off)', () => {
    it('is off when the env var is unset', () => {
      vi.stubEnv('VITE_R7_ENTRY_CHOICE', undefined as unknown as string)
      expect(isR7EntryChoiceEnabled()).toBe(false)
    })

    it('is off for any value other than "true"', () => {
      for (const value of ['false', '0', '1', 'yes', 'on', '', ' ']) {
        vi.stubEnv('VITE_R7_ENTRY_CHOICE', value)
        expect(isR7EntryChoiceEnabled()).toBe(false)
      }
    })

    it('is on only for "true" (case-insensitive, trimmed)', () => {
      for (const value of ['true', 'TRUE', 'True', '  true  ']) {
        vi.stubEnv('VITE_R7_ENTRY_CHOICE', value)
        expect(isR7EntryChoiceEnabled()).toBe(true)
      }
    })
  })
})
