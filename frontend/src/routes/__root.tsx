// i18n is not initialised: the app is English only (V1) and nothing calls t(). To re-enable it, add `import '#/lib/i18n'` here.
import { type ReactNode, useEffect } from 'react'
import { HeadContent, Outlet, ScriptOnce, Scripts, createRootRoute } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { AppNotFound } from '#/components/app/AppNotFound'
import { AppRouteError } from '#/components/app/AppRouteError'
import { AppShell } from '#/components/app/AppShell'
import { CookieConsent } from '#/components/app/CookieConsent'
import { SessionProvider } from '#/lib/auth/session'
import { SESSION_HINT_SCRIPT } from '#/lib/auth/sessionHint'
import { queryClient } from '#/lib/query/queryClient'
import { ARTICLE_PATHS, INDEXABLE_PATHS, siteOrigin, siteUrl } from '#/lib/site-url'
import appCss from '#/styles.css?url'
// The two above-the-fold faces are preloaded; the same hashed files are the ones styles.css references.
import bricolageLatin from '@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-opsz-normal.woff2?url'
import onestLatin from '@fontsource-variable/onest/files/onest-latin-wght-normal.woff2?url'

/** The path of the deepest matched route, without a trailing slash (except the root). */
function currentPath(matches: ReadonlyArray<{ pathname?: string }> | undefined) {
  const raw = matches?.[matches.length - 1]?.pathname ?? '/'
  return raw.length > 1 ? raw.replace(/\/+$/, '') : raw
}

export const Route = createRootRoute({
  head: (ctx) => {
    const path = currentPath(ctx?.matches)
    // The landing route ships its own canonical and share image; the other public pages get theirs here, once the site URL is known.
    const canonical =
      siteOrigin() && path !== '/' && (INDEXABLE_PATHS as readonly string[]).includes(path)
        ? [{ rel: 'canonical', href: siteUrl(path) }]
        : []
    return {
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
        { property: 'og:type', content: ARTICLE_PATHS.has(path) ? 'article' : 'website' },
        { name: 'twitter:card', content: 'summary' },
        { name: 'theme-color', content: '#f3f4f9' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
      ],
      links: [
        { rel: 'preload', as: 'font', type: 'font/woff2', href: bricolageLatin, crossOrigin: 'anonymous' },
        { rel: 'preload', as: 'font', type: 'font/woff2', href: onestLatin, crossOrigin: 'anonymous' },
        { rel: 'stylesheet', href: appCss },
        { rel: 'icon', href: '/favicon.svg?v=5', type: 'image/svg+xml', sizes: 'any' },
        { rel: 'icon', href: '/favicon.ico?v=5', type: 'image/x-icon', sizes: '48x48' },
        { rel: 'manifest', href: '/manifest.json' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png?v=5', sizes: '180x180' },
        ...canonical,
      ],
    }
  },
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
    // The session-hint script marks <html> before hydration; React must not report that attribute.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* Before the body is parsed, so a returning browser's first paint is already its own skeleton. */}
        <ScriptOnce>{SESSION_HINT_SCRIPT}</ScriptOnce>
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
