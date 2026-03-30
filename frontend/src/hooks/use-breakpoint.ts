import { useEffect, useState } from 'react'

export type Breakpoint = 'mobile' | 'tablet' | 'desktop'

const MOBILE_MAX = 639
const TABLET_MAX = 1024

function getBreakpoint(): Breakpoint {
  if (typeof window === 'undefined') return 'desktop'
  const w = window.innerWidth
  if (w <= MOBILE_MAX) return 'mobile'
  if (w <= TABLET_MAX) return 'tablet'
  return 'desktop'
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(getBreakpoint)

  useEffect(() => {
    setBp(getBreakpoint())

    const mqlMobile = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`)
    const mqlTablet = window.matchMedia(`(max-width: ${TABLET_MAX}px)`)

    const update = () => setBp(getBreakpoint())

    mqlMobile.addEventListener('change', update)
    mqlTablet.addEventListener('change', update)

    return () => {
      mqlMobile.removeEventListener('change', update)
      mqlTablet.removeEventListener('change', update)
    }
  }, [])

  return bp
}
