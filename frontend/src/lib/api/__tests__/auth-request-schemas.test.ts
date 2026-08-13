import { describe, expect, it } from 'vitest'
import {
  loginPasswordSchema,
  loginRequestSchema,
  passwordResetConfirmRequestSchema,
  registerRequestSchema,
} from '#/lib/api/schemas'

describe('auth request schemas', () => {
  it('mirrors the bcrypt byte bound for new and reset passwords', () => {
    const eighteenEmoji = '🔒'.repeat(18)
    const nineteenEmoji = '🔒'.repeat(19)

    expect(registerRequestSchema.safeParse({
      email: 'person@example.com',
      password: eighteenEmoji,
      tos_accepted: true,
    }).success).toBe(true)
    expect(registerRequestSchema.safeParse({
      email: 'person@example.com',
      password: nineteenEmoji,
      tos_accepted: true,
    }).success).toBe(false)
    expect(passwordResetConfirmRequestSchema.safeParse({
      token: 'reset-token',
      new_password: nineteenEmoji,
    }).success).toBe(false)
  })

  it('keeps login compatible with legacy passwords over 72 bytes', () => {
    expect(loginRequestSchema.safeParse({
      email: 'legacy@example.com',
      password: 'a'.repeat(73),
    }).success).toBe(true)
  })

  it('rejects lone UTF-16 surrogates before the backend UTF-8 boundary', () => {
    const malformedPassword = `password${String.fromCharCode(0xd800)}`

    expect(loginPasswordSchema.safeParse(malformedPassword).success).toBe(false)
    expect(loginRequestSchema.safeParse({
      email: 'person@example.com',
      password: malformedPassword,
    }).success).toBe(false)
    expect(registerRequestSchema.safeParse({
      email: 'person@example.com',
      password: malformedPassword,
      tos_accepted: true,
    }).success).toBe(false)
  })
})
