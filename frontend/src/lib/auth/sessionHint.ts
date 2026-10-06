/**
 * Whether this browser has held a session recently. The session cookies are HttpOnly, so the page cannot
 * see them; this hint only decides whether a 401 is worth a silent refresh. A browser that never signed in
 * (or signed out) skips POST /auth/refresh, so anonymous visits do not spend the shared refresh limit on a
 * call that cannot succeed. The hint lapses with the 7-day refresh cookie it stands for.
 */

const SESSION_HINT_KEY = 'cw-session-hint'
const SESSION_HINT_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function markSessionHint(): void {
  try {
    window.localStorage.setItem(SESSION_HINT_KEY, String(Date.now()))
  } catch {
    // Storage blocked: the browser is treated as never signed in.
  }
}

export function hasSessionHint(): boolean {
  try {
    const raw = window.localStorage.getItem(SESSION_HINT_KEY)
    if (!raw) return false
    const markedAt = Number(raw)
    return Number.isFinite(markedAt) && Date.now() - markedAt < SESSION_HINT_TTL_MS
  } catch {
    return false
  }
}

export function clearSessionHint(): void {
  try {
    window.localStorage.removeItem(SESSION_HINT_KEY)
  } catch {
    // ignore
  }
}
