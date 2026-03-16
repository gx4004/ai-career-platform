import type { ToolId } from '#/lib/tools/registry'
import {
  readStorageJson,
  removeStorageValue,
  writeStorageJson,
} from '#/lib/auth/storage'

const PENDING_INTENT_KEY = 'career-workbench:pending-intent'

export type PendingIntent = {
  to?: string
  reason?: string
  toolId?: ToolId
  label?: string
  createdAt: number
}

const INTENT_TTL_MS = 10 * 60 * 1000 // 10 minutes

export function readPendingIntent(): PendingIntent | null {
  const intent = readStorageJson<PendingIntent>(PENDING_INTENT_KEY)
  if (!intent) return null
  if (Date.now() - intent.createdAt > INTENT_TTL_MS) {
    removeStorageValue(PENDING_INTENT_KEY)
    return null
  }
  return intent
}

export function writePendingIntent(intent: PendingIntent): void {
  writeStorageJson(PENDING_INTENT_KEY, intent)
}

export function clearPendingIntent(): void {
  removeStorageValue(PENDING_INTENT_KEY)
}
