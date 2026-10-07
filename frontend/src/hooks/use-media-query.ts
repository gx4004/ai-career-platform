import { useSyncExternalStore } from 'react'

/**
 * True while a CSS media query matches, for the few layouts whose DOM (not just their CSS) follows a CSS
 * breakpoint: the result header renders its actions in the order they are seen (WCAG 2.4.3). The server
 * snapshot is false.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  )
}
