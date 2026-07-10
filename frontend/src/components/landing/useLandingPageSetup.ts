import { useEffect, useLayoutEffect, useRef } from 'react'
import { trackTelemetry } from '#/lib/telemetry/client'

function resetWindowScrollToTop() {
  if (typeof window === 'undefined') {
    return
  }

  const hasHash = window.location.hash.length > 0
  if (hasHash) {
    return
  }

  const previousScrollRestoration = window.history.scrollRestoration
  window.history.scrollRestoration = 'manual'

  const scrollToTop = () => {
    window.scrollTo?.({ top: 0, left: 0, behavior: 'auto' })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }

  const frameId = window.requestAnimationFrame(() => {
    window.requestAnimationFrame(scrollToTop)
  })
  scrollToTop()
  const timeoutId = window.setTimeout(scrollToTop, 0)
  const secondTimeoutId = window.setTimeout(scrollToTop, 60)
  const thirdTimeoutId = window.setTimeout(scrollToTop, 180)

  const handlePageShow = () => {
    scrollToTop()
  }

  const handleLoad = () => {
    scrollToTop()
  }

  window.addEventListener('pageshow', handlePageShow)
  window.addEventListener('load', handleLoad, { once: true })

  return () => {
    window.cancelAnimationFrame(frameId)
    window.clearTimeout(timeoutId)
    window.clearTimeout(secondTimeoutId)
    window.clearTimeout(thirdTimeoutId)
    window.removeEventListener('pageshow', handlePageShow)
    window.removeEventListener('load', handleLoad)
    window.history.scrollRestoration = previousScrollRestoration
  }
}

export function useLandingPageSetup() {
  useLayoutEffect(() => resetWindowScrollToTop(), [])

  useEffect(() => {
    document.body.classList.add('page-tone-landing')

    return () => {
      document.body.classList.remove('page-tone-landing')
    }
  }, [])

  // Fire the funnel-start event exactly once per landing page view (D-040).
  // The guard survives React's Strict-Mode double-invoke so a single view
  // dispatches a single event. Consent is enforced inside trackTelemetry.
  const viewedRef = useRef(false)
  useEffect(() => {
    if (viewedRef.current) return
    viewedRef.current = true
    trackTelemetry({ event_name: 'landing_page_viewed' })
  }, [])
}
