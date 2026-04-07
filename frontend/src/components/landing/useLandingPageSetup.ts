import { useEffect, useLayoutEffect } from 'react'

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

    const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    const appleStatusBarMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="apple-mobile-web-app-status-bar-style"]',
    )
    const previousThemeColor = themeColorMeta?.getAttribute('content') ?? null
    const previousAppleStatusBar = appleStatusBarMeta?.getAttribute('content') ?? null

    themeColorMeta?.setAttribute('content', '#f7f7f4')
    appleStatusBarMeta?.setAttribute('content', 'default')

    return () => {
      document.body.classList.remove('page-tone-landing')

      if (themeColorMeta) {
        if (previousThemeColor === null) {
          themeColorMeta.removeAttribute('content')
        } else {
          themeColorMeta.setAttribute('content', previousThemeColor)
        }
      }

      if (appleStatusBarMeta) {
        if (previousAppleStatusBar === null) {
          appleStatusBarMeta.removeAttribute('content')
        } else {
          appleStatusBarMeta.setAttribute('content', previousAppleStatusBar)
        }
      }
    }
  }, [])
}
