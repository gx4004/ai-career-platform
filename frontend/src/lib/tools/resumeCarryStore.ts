const STORAGE_KEY = 'cw:resume-carry'
const FILENAME_KEY = 'cw:resume-carry-filename'
const UPDATED_AT_KEY = 'cw:resume-carry-updated-at'

/**
 * Idle lifetime for the carried resume.
 *
 * The carry store keeps raw resume text so a resume uploaded once can be reused
 * across tools inside the tab. Tab close already bounds it, but a machine left
 * open does not close the tab, so the copy would otherwise live indefinitely.
 * Four hours matches the workflow-context TTL in `drafts.ts`: it comfortably
 * covers one working session and discards the copy afterwards.
 */
export const RESUME_CARRY_TTL_MS = 4 * 60 * 60 * 1000

let listeners: Array<() => void> = []

function emit() {
  listeners.forEach((listener) => listener())
}

function hasSessionStorage(): boolean {
  return typeof sessionStorage !== 'undefined'
}

function discardExpiredCarry(): void {
  sessionStorage.removeItem(STORAGE_KEY)
  sessionStorage.removeItem(FILENAME_KEY)
  sessionStorage.removeItem(UPDATED_AT_KEY)
}

/**
 * Returns false and discards the stored copy once it is past its lifetime.
 *
 * A copy with no stamp has unknown age — it predates this contract or was
 * written outside the store — so it is discarded rather than granted a fresh
 * lifetime. Reads stay side-effect-idempotent: after the first expired read the
 * keys are gone and every later read agrees, which keeps this safe as a
 * `useSyncExternalStore` snapshot source.
 */
function isCarryLive(): boolean {
  if (!hasSessionStorage()) return false
  if (sessionStorage.getItem(STORAGE_KEY) === null) return true

  const stampedAt = Number(sessionStorage.getItem(UPDATED_AT_KEY))
  if (!Number.isFinite(stampedAt) || stampedAt <= 0) {
    discardExpiredCarry()
    return false
  }
  if (Date.now() - stampedAt > RESUME_CARRY_TTL_MS) {
    discardExpiredCarry()
    return false
  }
  return true
}

export function subscribeToResumeCarry(listener: () => void) {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((candidate) => candidate !== listener)
  }
}

export function getResumeCarryText(): string {
  if (!hasSessionStorage()) return ''
  if (!isCarryLive()) return ''
  return sessionStorage.getItem(STORAGE_KEY) ?? ''
}

export function getResumeCarryFilename(): string {
  if (!hasSessionStorage()) return ''
  if (!isCarryLive()) return ''
  return sessionStorage.getItem(FILENAME_KEY) ?? ''
}

export function setResumeCarry(text: string, name?: string): void {
  if (text) {
    sessionStorage.setItem(STORAGE_KEY, text)
    // Every write restarts the idle lifetime; an untouched copy still expires.
    sessionStorage.setItem(UPDATED_AT_KEY, String(Date.now()))
    if (name) sessionStorage.setItem(FILENAME_KEY, name)
  } else {
    sessionStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem(FILENAME_KEY)
    sessionStorage.removeItem(UPDATED_AT_KEY)
  }
  emit()
}

export function clearResumeCarry(): void {
  if (!hasSessionStorage()) return
  sessionStorage.removeItem(STORAGE_KEY)
  sessionStorage.removeItem(FILENAME_KEY)
  sessionStorage.removeItem(UPDATED_AT_KEY)
  emit()
}
