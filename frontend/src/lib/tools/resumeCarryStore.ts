const STORAGE_KEY = 'cw:resume-carry'
const FILENAME_KEY = 'cw:resume-carry-filename'
const UPDATED_AT_KEY = 'cw:resume-carry-updated-at'
/** Where the carried text was supplied (a tool id, or "dashboard"): names it honestly elsewhere ("Resume from Job Match"). */
const ORIGIN_KEY = 'cw:resume-carry-origin'

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
  sessionStorage.removeItem(ORIGIN_KEY)
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

/** Where the carried resume was supplied ("resume", "job-match", "dashboard"), or '' when that is not known. */
export function getResumeCarryOrigin(): string {
  if (!hasSessionStorage()) return ''
  if (!isCarryLive()) return ''
  return sessionStorage.getItem(ORIGIN_KEY) ?? ''
}

/**
 * Keep `text` for the tab. `name` is the file it was read from; `origin` is where it was supplied (a tool id). The same
 * text written again keeps the file name and origin it already had (running a carried resume on another tool does not
 * make that tool its source); new text takes the given ones, or none.
 */
export function setResumeCarry(text: string, name?: string, origin?: string): void {
  if (text) {
    const previous = sessionStorage.getItem(STORAGE_KEY)
    sessionStorage.setItem(STORAGE_KEY, text)
    // Every write restarts the idle lifetime; an untouched copy still expires.
    sessionStorage.setItem(UPDATED_AT_KEY, String(Date.now()))
    if (name) sessionStorage.setItem(FILENAME_KEY, name)
    // Different text with no file behind it (pasted or edited): the old file name no longer describes it.
    else if (text !== previous) sessionStorage.removeItem(FILENAME_KEY)
    if (text !== previous) {
      if (origin) sessionStorage.setItem(ORIGIN_KEY, origin)
      else sessionStorage.removeItem(ORIGIN_KEY)
    } else if (origin && !sessionStorage.getItem(ORIGIN_KEY)) {
      sessionStorage.setItem(ORIGIN_KEY, origin)
    }
  } else {
    sessionStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem(FILENAME_KEY)
    sessionStorage.removeItem(UPDATED_AT_KEY)
    sessionStorage.removeItem(ORIGIN_KEY)
  }
  emit()
}

export function clearResumeCarry(): void {
  if (!hasSessionStorage()) return
  sessionStorage.removeItem(STORAGE_KEY)
  sessionStorage.removeItem(FILENAME_KEY)
  sessionStorage.removeItem(UPDATED_AT_KEY)
  sessionStorage.removeItem(ORIGIN_KEY)
  emit()
}
