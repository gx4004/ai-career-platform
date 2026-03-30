// Career Workbench — Basic Service Worker
// Caches the app shell for offline-ready PWA experience.
// Does NOT cache API responses (LLM results require backend).

const CACHE_NAME = 'cw-shell-v1'

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

// Fetch: network-first for navigations and API, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET and API requests
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return
  }

  // Static assets: cache-first (only Vite hashed output in /assets/)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached || fetch(request).then((response) => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          return response
        })
      )
    )
    return
  }

  // Navigations: network-first, fallback to cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/dashboard').then((r) => r || caches.match('/')))
    )
  }
})
