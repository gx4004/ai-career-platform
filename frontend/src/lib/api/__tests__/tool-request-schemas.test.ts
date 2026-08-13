import { describe, expect, it } from 'vitest'
import {
  boundedIdentifierSchema,
  resumeAnalyzeRequestSchema,
} from '#/lib/api/schemas'

describe('tool request schema character bounds', () => {
  it('mirrors backend Unicode code-point bounds instead of UTF-16 code units', () => {
    expect(resumeAnalyzeRequestSchema.safeParse({ resume_text: '🧭'.repeat(49) }).success).toBe(false)
    expect(resumeAnalyzeRequestSchema.safeParse({ resume_text: '🧭'.repeat(50) }).success).toBe(true)
    expect(resumeAnalyzeRequestSchema.safeParse({ resume_text: '🧭'.repeat(50_000) }).success).toBe(true)
    expect(resumeAnalyzeRequestSchema.safeParse({ resume_text: '🧭'.repeat(50_001) }).success).toBe(false)

    expect(boundedIdentifierSchema.safeParse('🧭'.repeat(100)).success).toBe(true)
    expect(boundedIdentifierSchema.safeParse('🧭'.repeat(101)).success).toBe(false)
  })
})
