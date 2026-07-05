import { ApiError } from '#/lib/api/errors'
import type { ToolDefinition } from '#/lib/tools/registry'

export function getToolRunError(tool: ToolDefinition, error: unknown): Error {
  const isProviderFailure =
    (error instanceof ApiError && error.status >= 500) ||
    (error instanceof TypeError && error.message === 'Failed to fetch')

  if (
    tool.providerFailureMode === 'explicit_error' &&
    isProviderFailure
  ) {
    return new Error(
      'Generation failed because the AI service is unavailable. Try again in a moment.',
    )
  }

  return error instanceof Error ? error : new Error('This run failed.')
}
