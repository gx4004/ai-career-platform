import { request } from '#/lib/api/client'
import { apiErrorFromZod } from '#/lib/api/errors'
import {
  applicationCreateSchema,
  applicationDetailSchema,
  applicationEventPageSchema,
} from '#/lib/api/schemas'
import type { ApplicationCreate } from '#/lib/api/schemas'

// Application calls the shared client does not have yet (POST /applications, the activity pages).
// They sit next to the components that use them and go through the same `request` wrapper.

/** Track a job by hand: role and company, optionally its posting, link and apply-by date. */
export function createApplication(payload: ApplicationCreate) {
  const parsed = applicationCreateSchema.safeParse(payload)
  if (!parsed.success) throw apiErrorFromZod(parsed.error)
  return request('/applications', { method: 'POST', body: parsed.data, schema: applicationDetailSchema })
}

/**
 * One page of an application's activity, counted back from the newest event (`offset` events are
 * skipped from the newest end); each page comes back oldest first.
 */
export function listApplicationEvents(applicationId: string, offset: number, limit = 50) {
  const query = new URLSearchParams({ offset: String(offset), limit: String(limit) })
  return request(`/applications/${applicationId}/events?${query}`, { method: 'GET', schema: applicationEventPageSchema })
}
