import '#/lib/i18n'
import * as Sentry from '@sentry/react'
import { type ReactNode, useEffect } from 'react'

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  })
}
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { useRouterState } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { AppNotFound } from '#/components/app/AppNotFound'
import { AppRouteError } from '#/components/app/AppRouteError'
import { AppShell } from '#/components/app/AppShell'
import { CookieConsent } from '#/components/app/CookieConsent'
import { AnimatePresence, motion, MotionConfig } from '#/components/ui/motion'
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
      { property: 'og:url', content: 'https://careerworkbench.app' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'theme-color', content: '#0f1a2e' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.ico', type: 'image/x-icon' },
      { rel: 'manifest', href: '/manifest.json' },
      { rel: 'apple-touch-icon', href: '/logo192.png' },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: AppNotFound,
  errorComponent: ({ error, reset }) => (
    <AppRouteError error={error} reset={reset} />
  ),
})

function PageTransition({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
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
            <MotionConfig reducedMotion="user">
              <AppShell>
                <PageTransition>{children || <Outlet />}</PageTransition>
              </AppShell>
              <CookieConsent />
            </MotionConfig>
          </SessionProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  )
}
