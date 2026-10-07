import { ApiError } from '#/lib/api/errors'

/**
 * What a failed resume read says, the same wherever a file is uploaded. The server's 400 ("could not be safely parsed")
 * and 413 give no next step, so they become one: `alternative` is the other way in that this place offers (the
 * dashboard has the sample resume, a tool's resume field has pasting the text). Anything else (offline, a server error)
 * keeps its own readable sentence.
 */
export function uploadErrorText(error: unknown, alternative: string): string {
  if (error instanceof ApiError && error.status === 400) {
    return `We couldn't read that file. Try another PDF or DOCX, or ${alternative}.`
  }
  if (error instanceof ApiError && error.status === 413) {
    return `That file is too large to read (the limit is 10 MB). Try a smaller PDF or DOCX, or ${alternative}.`
  }
  return error instanceof Error ? error.message : 'Failed to parse resume. Please try again.'
}
