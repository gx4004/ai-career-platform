import { ApiError } from '#/lib/api/errors'
import type { ToolDefinition } from '#/lib/tools/registry'

const AI_UNAVAILABLE = 'Generation failed because the AI service is unavailable. Try again in a moment.'
const SERVER = 'Something went wrong on our side. Try again in a moment.'

export function getToolRunError(tool: ToolDefinition, error: unknown): Error {
  // Generative tools have no heuristic fallback, so say plainly which side failed. The API client turns a
  // dropped connection or a timeout into ApiError status 0 (never the browser's raw "Failed to fetch").
  if (tool.providerFailureMode === 'explicit_error' && error instanceof ApiError) {
    // No response at all: the client already chose the app-wide offline or timeout sentence, so every tool says the same thing.
    if (error.status === 0) return error
    // The pipeline answers 503 when the model call gave up; 502/504 are the gateway timing out on it. A plain 500 is
    // a server bug, not the AI service, so it gets the generic server sentence.
    if (error.status >= 502 && error.status <= 504) return new Error(AI_UNAVAILABLE)
    if (error.status >= 500) return new Error(SERVER)
  }

  return error instanceof Error ? error : new Error('This run failed.')
}
