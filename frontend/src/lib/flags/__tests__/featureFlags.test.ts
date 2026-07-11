import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isR7ContextCarryEnabled,
  isR7EntryChoiceEnabled,
  isR7NextBestActionEnabled,
  isR7SampleQuickfillEnabled,
  isR7ValueSpecificSignupEnabled,
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

  describe('isR7ContextCarryEnabled (dark-ship default off)', () => {
    it('is off when the env var is unset', () => {
      vi.stubEnv('VITE_R7_CONTEXT_CARRY', undefined as unknown as string)
      expect(isR7ContextCarryEnabled()).toBe(false)
    })

    it('is off for any value other than "true"', () => {
      for (const value of ['false', '0', '1', 'yes', 'on', '', ' ']) {
        vi.stubEnv('VITE_R7_CONTEXT_CARRY', value)
        expect(isR7ContextCarryEnabled()).toBe(false)
      }
    })

    it('is on only for "true" (case-insensitive, trimmed)', () => {
      for (const value of ['true', 'TRUE', 'True', '  true  ']) {
        vi.stubEnv('VITE_R7_CONTEXT_CARRY', value)
        expect(isR7ContextCarryEnabled()).toBe(true)
      }
    })

    it('is independent of the other R7 candidate flags', () => {
      vi.stubEnv('VITE_R7_ENTRY_CHOICE', 'true')
      vi.stubEnv('VITE_R7_SAMPLE_QUICKFILL', 'true')
      vi.stubEnv('VITE_R7_CONTEXT_CARRY', undefined as unknown as string)
      expect(isR7ContextCarryEnabled()).toBe(false)
      expect(isR7EntryChoiceEnabled()).toBe(true)
      expect(isR7SampleQuickfillEnabled()).toBe(true)
    })
  })

  describe('isR7NextBestActionEnabled (dark-ship default off)', () => {
    it('is off when the env var is unset', () => {
      vi.stubEnv('VITE_R7_NEXT_BEST_ACTION', undefined as unknown as string)
      expect(isR7NextBestActionEnabled()).toBe(false)
    })

    it('is on only for "true" (case-insensitive, trimmed)', () => {
      for (const value of ['false', '0', 'yes', '', ' ']) {
        vi.stubEnv('VITE_R7_NEXT_BEST_ACTION', value)
        expect(isR7NextBestActionEnabled()).toBe(false)
      }
      for (const value of ['true', 'TRUE', '  true  ']) {
        vi.stubEnv('VITE_R7_NEXT_BEST_ACTION', value)
        expect(isR7NextBestActionEnabled()).toBe(true)
      }
    })

    it('is independent of the other R7 candidate flags', () => {
      vi.stubEnv('VITE_R7_ENTRY_CHOICE', 'true')
      vi.stubEnv('VITE_R7_SAMPLE_QUICKFILL', 'true')
      vi.stubEnv('VITE_R7_CONTEXT_CARRY', 'true')
      vi.stubEnv('VITE_R7_NEXT_BEST_ACTION', undefined as unknown as string)
      expect(isR7NextBestActionEnabled()).toBe(false)
    })
  })

  describe('isR7ValueSpecificSignupEnabled (dark-ship default off)', () => {
    it('is off unless explicitly enabled with "true"', () => {
      for (const value of [undefined, 'false', '0', 'yes', '', ' ']) {
        vi.stubEnv('VITE_R7_VALUE_SPECIFIC_SIGNUP', value as string)
        expect(isR7ValueSpecificSignupEnabled()).toBe(false)
      }
      for (const value of ['true', 'TRUE', '  true  ']) {
        vi.stubEnv('VITE_R7_VALUE_SPECIFIC_SIGNUP', value)
        expect(isR7ValueSpecificSignupEnabled()).toBe(true)
      }
    })

    it('is independent of the other R7 candidate flags', () => {
      vi.stubEnv('VITE_R7_NEXT_BEST_ACTION', 'true')
      vi.stubEnv('VITE_R7_VALUE_SPECIFIC_SIGNUP', undefined as unknown as string)
      expect(isR7ValueSpecificSignupEnabled()).toBe(false)
      expect(isR7NextBestActionEnabled()).toBe(true)
    })
  })
})
