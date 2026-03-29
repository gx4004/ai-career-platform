import '#/lib/i18n'
import { type ReactNode, useEffect } from 'react'
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { useRouterState } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { AppNotFound } from '#/components/app/AppNotFound'
import { AppRouteError } from '#/components/app/AppRouteError'
import { AppShell } from '#/components/app/AppShell'
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
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // SW registration failed — silent, non-critical
      })
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
            </MotionConfig>
          </SessionProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  )
}
