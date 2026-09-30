import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// findBy*/waitFor poll until the condition holds; 1s (the default) is too tight
// for screens that mount heavy trees under load. Ceiling only, see vite.config.ts.
configure({ asyncUtilTimeout: 5_000 })

afterEach(() => {
  cleanup()
  document.cookie = 'sidebar_state=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
})

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      // Keep motion-heavy component tests aligned with reduced-motion behavior.
      matches: /prefers-reduced-motion/.test(query),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}

if (!globalThis.ResizeObserver) {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver
}

if (!globalThis.IntersectionObserver) {
  class IntersectionObserverMock {
    readonly root = null
    readonly rootMargin = '0px'
    readonly thresholds = [0]

    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }

  globalThis.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver
}
