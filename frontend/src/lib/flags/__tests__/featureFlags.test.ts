import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isR7EntryChoiceEnabled,
  isR7SampleQuickfillEnabled,
} from '#/lib/flags/featureFlags'

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

  describe('isR7SampleQuickfillEnabled (dark-ship default off)', () => {
    it('is off when the env var is unset', () => {
      vi.stubEnv('VITE_R7_SAMPLE_QUICKFILL', undefined as unknown as string)
      expect(isR7SampleQuickfillEnabled()).toBe(false)
    })

    it('is off for any value other than "true"', () => {
      for (const value of ['false', '0', '1', 'yes', 'on', '', ' ']) {
        vi.stubEnv('VITE_R7_SAMPLE_QUICKFILL', value)
        expect(isR7SampleQuickfillEnabled()).toBe(false)
      }
    })

    it('is on only for "true" (case-insensitive, trimmed)', () => {
      for (const value of ['true', 'TRUE', 'True', '  true  ']) {
        vi.stubEnv('VITE_R7_SAMPLE_QUICKFILL', value)
        expect(isR7SampleQuickfillEnabled()).toBe(true)
      }
    })

    it('is independent of the entry-choice flag', () => {
      vi.stubEnv('VITE_R7_ENTRY_CHOICE', 'true')
      vi.stubEnv('VITE_R7_SAMPLE_QUICKFILL', undefined as unknown as string)
      expect(isR7SampleQuickfillEnabled()).toBe(false)
      expect(isR7EntryChoiceEnabled()).toBe(true)
    })
  })
})
