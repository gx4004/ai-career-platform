import { ApiError } from '#/lib/api/errors'
import type { ToolDefinition } from '#/lib/tools/registry'

export function getToolRunError(tool: ToolDefinition, error: unknown): Error {
  // The API client turns a dropped connection or a timeout into ApiError status 0 (it never surfaces the
  // browser's raw "Failed to fetch" TypeError), so status 0 is the network case.
  const isProviderFailure = error instanceof ApiError && (error.status >= 500 || error.status === 0)

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
