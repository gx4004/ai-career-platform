import { describe, expect, it } from 'vitest'
import { ApiError, networkErrorFrom } from '#/lib/api/errors'
import { tools } from '#/lib/tools/registry'
import { getToolRunError } from '#/lib/tools/runErrors'

describe('getToolRunError', () => {
  it.each(['cover-letter', 'interview', 'career', 'portfolio'] as const)(
    'turns a %s provider failure (the pipeline\'s 503, or a 502/504 from the gateway) into an actionable generation error',
    (toolId) => {
      for (const status of [502, 503, 504]) {
        const result = getToolRunError(tools[toolId], new ApiError('Service Unavailable', status))
        expect(result.message).toBe(
          'Generation failed because the AI service is unavailable. Try again in a moment.',
        )
      }
    },
  )

  it('does not blame the AI service for any other server error', () => {
    for (const status of [500, 501]) {
      const result = getToolRunError(tools.career, new ApiError('Internal Server Error', status))
      expect(result.message).toBe('Something went wrong on our side. Try again in a moment.')
    }
  })

  it.each(['cover-letter', 'resume'] as const)(
    'keeps the client\'s app-wide sentence for a dropped connection on %s, not the AI service (status 0)',
    (toolId) => {
      const offline = networkErrorFrom(new TypeError('Failed to fetch'))

      expect(getToolRunError(tools[toolId], offline)).toBe(offline)
      expect(offline.message).toBe("Can't reach the server. Check your connection and try again.")
    },
  )

  it('keeps the client\'s own sentence for a timeout', () => {
    const timeout = new ApiError('The server took too long to answer. Try again in a moment.', 0, undefined, {
      cause: Object.assign(new Error('timed out'), { name: 'TimeoutError' }),
    })

    expect(getToolRunError(tools.portfolio, timeout)).toBe(timeout)
  })

  it.each(['resume', 'job-match'] as const)(
    'does not rewrite errors for heuristic tool %s',
    (toolId) => {
      const error = new ApiError('Validation failed', 422)

      expect(getToolRunError(tools[toolId], error)).toBe(error)
    },
  )
})
