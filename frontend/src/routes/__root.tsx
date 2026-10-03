import '#/lib/i18n'
import { type ReactNode, useEffect } from 'react'
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { AppNotFound } from '#/components/app/AppNotFound'
import { AppRouteError } from '#/components/app/AppRouteError'
import { AppShell } from '#/components/app/AppShell'
import { CookieConsent } from '#/components/app/CookieConsent'
import { SessionProvider } from '#/lib/auth/session'
import { queryClient } from '#/lib/query/queryClient'
import appCss from '#/styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Career Workbench' },
      {
        name: 'description',
        content: 'AI-powered job-search workflow for resume analysis, matching, and application prep.',
      },
      { property: 'og:title', content: 'Career Workbench' },
      {
        property: 'og:description',
        content: 'AI-powered job-search workflow for resume analysis, matching, and application prep.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'theme-color', content: '#f6f3ec' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400..700&family=Newsreader:opsz,wght@6..72,400..600&family=Space+Grotesk:wght@400..700&display=swap',
      },
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg?v=4', type: 'image/svg+xml', sizes: 'any' },
      { rel: 'icon', href: '/favicon.ico?v=4', type: 'image/x-icon', sizes: '48x48' },
      { rel: 'manifest', href: '/manifest.json' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png?v=4', sizes: '180x180' },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: AppNotFound,
  errorComponent: ({ error, reset }) => (
    <AppRouteError error={error} reset={reset} />
  ),
})

function RootDocument({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.dataset.hydrated = 'true'
    return () => {
      delete document.documentElement.dataset.hydrated
    }
  }, [])

  // Register service worker for PWA support
  useEffect(() => {
    const RELOAD_FLAG = 'cw:sw-reload-pending'

    if ('serviceWorker' in navigator) {
      const reloadOnceForUpdatedWorker = () => {
        if (sessionStorage.getItem(RELOAD_FLAG) === '1') return
        sessionStorage.setItem(RELOAD_FLAG, '1')
        window.location.reload()
      }

      const handleControllerChange = () => {
        reloadOnceForUpdatedWorker()
      }

      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)

      navigator.serviceWorker.register('/sw.js').then((registration) => {
        sessionStorage.removeItem(RELOAD_FLAG)

        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing
          if (!installing) return

          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              installing.postMessage({ type: 'SKIP_WAITING' })
            }
          })
        })

        void registration.update().catch(() => {
          // Update checks are best-effort only.
        })
      }).catch(() => {
        // SW registration failed — silent, non-critical
      })

      return () => {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
      }
    }
  }, [])

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
              <AppShell>
                {children || <Outlet />}
              </AppShell>
              <CookieConsent />
          </SessionProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  )
}
