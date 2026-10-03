import { useSyncExternalStore } from 'react'

export type Breakpoint = 'mobile' | 'tablet' | 'desktop'

const MOBILE_MAX = 639
const TABLET_MAX = 1024

function getBreakpoint(): Breakpoint {
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
