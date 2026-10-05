import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ApiError } from '#/lib/api/errors'
import { describeFailure, formatWait } from '#/components/auth/auth-errors'

describe('describeFailure', () => {
  it('turns a ZodError into one message per field', () => {
    const result = z.object({ email: z.email(), password: z.string().min(8, 'Password is too short') }).safeParse({ email: 'nope', password: 'x' })
    const failure = describeFailure(result.error)
    expect(failure.kind).toBe('validation')
    expect(failure.fields.email).toBe('Enter a valid email address.')
    expect(failure.fields.password).toBe('Password is too short')
  })

  it('reads a 429 with the limiter wording as a wait in seconds', () => {
    const failure = describeFailure(new ApiError('Rate limit exceeded: 3 per 1 minute', 429, 'Rate limit exceeded: 3 per 1 minute'))
    expect(failure.kind).toBe('rate-limit')
    expect(failure.retryAfter).toBe(60)
    expect(failure.message).toBe('Too many attempts. Try again in 60\u00a0s.')
  })

  it('prefers a retryAfter the API client carries', () => {
    const error = Object.assign(new ApiError('Too many requests', 429), { retryAfter: 30 })
    expect(describeFailure(error).retryAfter).toBe(30)
  })

  it('still says something useful when a 429 carries no wait', () => {
    const failure = describeFailure(new ApiError('Request failed', 429))
    expect(failure.retryAfter).toBeUndefined()
    expect(failure.message).toContain('Wait a minute')
  })

  it('does not show the server a raw object for a 422 and a 5xx', () => {
    expect(describeFailure(new ApiError('[object Object]', 422)).message).toContain('Check the fields')
    expect(describeFailure(new ApiError('Request failed', 503)).message).toBe('Something went wrong on our side. Try again in a moment.')
  })

  it('names a dropped connection', () => {
    expect(describeFailure(new TypeError('Failed to fetch')).kind).toBe('offline')
  })

  it('keeps a plain server message and a plain string', () => {
    expect(describeFailure(new ApiError('Incorrect email or password.', 401)).message).toBe('Incorrect email or password.')
    expect(describeFailure('Incorrect email or password.').message).toBe('Incorrect email or password.')
    expect(describeFailure('Rate limit exceeded: 5 per 1 minute').kind).toBe('rate-limit')
  })

  it('formats a wait in the unit people think in', () => {
    expect(formatWait(45)).toBe('45\u00a0s')
    expect(formatWait(60)).toBe('60\u00a0s')
    expect(formatWait(120)).toBe('2 minutes')
  })
})
