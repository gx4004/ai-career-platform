import type { z } from 'zod'
import { request } from '#/lib/api/client'
import {
  developmentItemCreateSchema,
  developmentItemSchema,
  developmentItemUpdateSchema,
  developmentPlanResponseSchema,
} from '#/lib/api/developmentSchemas'

// R17 #199 "Skills to build" client, on the shared request() wrapper (auth
// refresh, error mapping, response validation). Request bodies are parsed
// through the schemas so `null` (clear) vs. omitted (leave unchanged) is
// preserved end-to-end (D-112).

export type DevelopmentItemCreate = z.infer<typeof developmentItemCreateSchema>
export type DevelopmentItemUpdate = z.infer<typeof developmentItemUpdateSchema>

export function getDevelopmentPlan() {
  return request('/development-plan', { method: 'GET', schema: developmentPlanResponseSchema })
}

export function createDevelopmentItem(payload: DevelopmentItemCreate) {
  return request('/development-plan', {
    method: 'POST',
    body: developmentItemCreateSchema.parse(payload),
    schema: developmentItemSchema,
  })
}

export function updateDevelopmentItem(itemId: string, payload: DevelopmentItemUpdate) {
  return request(`/development-plan/${itemId}`, {
    method: 'PATCH',
    body: developmentItemUpdateSchema.parse(payload),
    schema: developmentItemSchema,
  })
}

export function deleteDevelopmentItem(itemId: string) {
  return request<void>(`/development-plan/${itemId}`, { method: 'DELETE' })
}
