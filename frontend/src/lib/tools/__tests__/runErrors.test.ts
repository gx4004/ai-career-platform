import { describe, expect, it } from 'vitest'
import { ApiError } from '#/lib/api/errors'
import { tools } from '#/lib/tools/registry'
import { getToolRunError } from '#/lib/tools/runErrors'

describe('getToolRunError', () => {
  it.each(['cover-letter', 'interview', 'career', 'portfolio'] as const)(
    'turns a %s provider failure into an actionable generation error',
    (toolId) => {
      const result = getToolRunError(
        tools[toolId],
        new ApiError('Internal Server Error', 500),
      )

      expect(result.message).toBe(
        'Generation failed because the AI service is unavailable. Try again in a moment.',
      )
    },
  )

  it('turns a generative network failure into the same actionable error', () => {
    const result = getToolRunError(
      tools['cover-letter'],
      new TypeError('Failed to fetch'),
    )

    expect(result.message).toBe(
      'Generation failed because the AI service is unavailable. Try again in a moment.',
    )
  })

  it.each(['resume', 'job-match'] as const)(
    'does not rewrite errors for heuristic tool %s',
    (toolId) => {
      const error = new ApiError('Validation failed', 422)

      expect(getToolRunError(tools[toolId], error)).toBe(error)
    },
  )
})
