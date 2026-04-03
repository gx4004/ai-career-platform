// Career Workbench — Basic Service Worker
// Caches the app shell for offline-ready PWA experience.
// Does NOT cache API responses (LLM results require backend).

const CACHE_NAME = 'cw-shell-v2'

const SHELL_ASSETS = [
  '/',
  '/dashboard',
  '/manifest.json',
  '/favicon.ico',
  '/logo192.png',
]

// Install: pre-cache shell assets (individual puts to avoid all-or-nothing failure)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        SHELL_ASSETS.map((url) => cache.add(url).catch(() => { /* missing asset — skip */ }))
      )
    )
  )
  self.skipWaiting()
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

function shouldCache(response) {
  return response && response.ok && response.type === 'basic'
}

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE_NAME)

  try {
    const response = await fetch(request)
    if (shouldCache(response)) {
      cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    const cached = await caches.match(request)
    if (cached) {
      return cached
    }

    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl)
      if (fallback) {
        return fallback
      }
    }

    throw error
  }
}

// Fetch: network-first for navigations and same-origin assets
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET and API requests
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return
  }

  // Same-origin static assets: network-first so deploys cannot strand old chunks.
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(networkFirst(request))
    return
  }

  // Navigations: network-first, fallback to cache
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/dashboard'))
  }
})
