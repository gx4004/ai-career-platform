/**
 * Whether this browser has held a session recently. The session cookies are HttpOnly, so the page cannot
 * see them; this hint only decides whether a 401 is worth a silent refresh. A browser that never signed in
 * (or signed out) skips POST /auth/refresh, so anonymous visits do not spend the shared refresh limit on a
 * call that cannot succeed. The hint lapses with the 7-day refresh cookie it stands for.
 */

import { useSyncExternalStore } from 'react'

const SESSION_HINT_KEY = 'cw-session-hint'
const SESSION_HINT_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Runs in <head> before the body is parsed and puts `data-session-hint` on <html> when the hint holds (same
 * rule as `hasSessionHint`). The server cannot read localStorage, so its HTML cannot know whether this
 * browser was signed in; the attribute lets CSS pick the right first paint while the hydration render still
 * matches the server's HTML (see `useSessionHint`).
 */
export const SESSION_HINT_SCRIPT = `try{var r=localStorage.getItem(${JSON.stringify(SESSION_HINT_KEY)});if(r&&Date.now()-Number(r)<${SESSION_HINT_TTL_MS})document.documentElement.setAttribute('data-session-hint','')}catch(e){}`

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

const noSubscription = () => () => {}

/**
 * `hasSessionHint` for a render: null on the server and during hydration (the server cannot see the hint, so
 * the hydration render must not depend on it), the browser's answer right after. A page that draws different
 * frames for a returning browser renders both while this is null and lets `[data-session-hint]` on <html>
 * (set by `SESSION_HINT_SCRIPT`) show one of them.
 */
export function useSessionHint(): boolean | null {
  return useSyncExternalStore(noSubscription, hasSessionHint, () => null)
}
