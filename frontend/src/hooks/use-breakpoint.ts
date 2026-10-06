import { useSyncExternalStore } from 'react'

export type Breakpoint = 'mobile' | 'tablet' | 'desktop'

const MOBILE_MAX = 639
const TABLET_MAX = 1024

export function getBreakpoint(): Breakpoint {
  const w = window.innerWidth
  if (w <= MOBILE_MAX) return 'mobile'
  if (w <= TABLET_MAX) return 'tablet'
  return 'desktop'
}

function subscribe(onChange: () => void) {
  const mqlMobile = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`)
  const mqlTablet = window.matchMedia(`(max-width: ${TABLET_MAX}px)`)
  mqlMobile.addEventListener('change', onChange)
  mqlTablet.addEventListener('change', onChange)
  return () => {
    mqlMobile.removeEventListener('change', onChange)
    mqlTablet.removeEventListener('change', onChange)
  }
}

// The server snapshot is what hydration renders first; React then re-renders with
// the real client value, so a phone never hits a hydration mismatch.
export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, getBreakpoint, () => 'desktop')
}

/**
 * The breakpoint once the browser knows it, or null while the server renders and the page hydrates (no
 * window to measure). The shell renders every layout part while it is null and lets CSS media queries pick
 * (styles/shell.css), so a phone gets its own layout in the server HTML instead of the desktop one.
 */
export function useKnownBreakpoint(): Breakpoint | null {
  return useSyncExternalStore(subscribe, getBreakpoint, () => null)
}
