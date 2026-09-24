import { createServer } from 'node:http'
import { readFileSync, existsSync, readdirSync, realpathSync } from 'node:fs'
import { join, extname, resolve, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const clientDir = join(__dirname, 'dist', 'client')

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function configuredOrigin(value) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null
  } catch {
    return null
  }
}

// Hosts this server is willing to echo back in a redirect `Location`. The `Host`
// header is client-controlled, so it is validated before it is reflected
// (CWE-601 open redirect / cache poisoning). The variable names and the
// comma-separated shape deliberately match the allowlist the backend already
// reads (`backend/app/config.py:22-23`, `backend/app/main.py:306-308`), so a
// deployment configures one set of origins for both services; like
// SECURITY_HSTS_ENABLED these are plain runtime variables, not build-time VITE_*
// ones. Both default to unset, and unset is the safe path: with no configured
// origin the server emits no host-derived redirect at all.
function configuredRedirectHosts() {
  const hosts = []
  for (const value of [
    process.env.FRONTEND_URL,
    ...(process.env.CORS_ORIGINS ?? '').split(','),
  ]) {
    const origin = configuredOrigin(value?.trim())
    if (!origin) continue
    const { host } = new URL(origin)
    if (!hosts.includes(host)) hosts.push(host)
  }
  return hosts
}

const redirectHosts = configuredRedirectHosts()

function httpsRedirectLocation(req) {
  if (redirectHosts.length === 0) return null
  // An unrecognised Host falls back to the first configured origin instead of
  // being reflected, so a forged Host can never steer the redirect.
  const host = redirectHosts.includes(req.headers.host) ? req.headers.host : redirectHosts[0]
  try {
    // Re-parsing against the trusted host also neutralises absolute-form request
    // targets (`GET http://evil/ HTTP/1.1`) and protocol-relative paths.
    const { pathname, search } = new URL(req.url, `https://${host}`)
    return `https://${host}${pathname}${search}`
  } catch {
    return `https://${host}/`
  }
}

// `Host` is untrusted and may not be a parseable URL host. An unguarded
// `new URL()` here throws synchronously in the request handler and takes the
// whole process down, so an unparseable Host becomes a 400 instead.
function requestUrl(req) {
  try {
    return new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
  } catch {
    return null
  }
}

function securityHeaders(req) {
  const connectOrigins = new Set(["'self'"])
  for (const value of [
    process.env.VITE_API_URL,
    process.env.VITE_SENTRY_DSN,
  ]) {
    const origin = configuredOrigin(value)
    if (origin) connectOrigins.add(origin)
  }

  const headers = {
    'Content-Security-Policy': [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      `connect-src ${[...connectOrigins].join(' ')}`,
      "font-src 'self' https://fonts.gstatic.com",
      // The CV Studio preview frames a blob: URL it created itself
      // (src/components/cv-studio/CvPreview.tsx). blob: is excluded from
      // matching 'self' or any host-source in CSP3, so without this directive
      // `default-src 'self'` governs frames and Chromium blocks the preview
      // ("Framing 'blob:…' violates … default-src 'self'"). 'self' is kept so
      // the only delta versus the previous effective policy is blob:.
      // child-src is intentionally omitted: it is only a fallback for
      // frame-src/worker-src, both of which are declared explicitly here and are
      // supported by every browser this build targets (Vite's default
      // baseline-widely-available floor is well above frame-src's CSP2 and
      // worker-src's CSP3 support), so it would never be consulted.
      "frame-src 'self' blob:",
      // Every image the app renders is repo-local, a data: URI, or a blob: URL
      // it generated; there is no third-party image origin to allow.
      "img-src 'self' data: blob:",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "worker-src 'self' blob:",
    ].join('; '),
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  }

  // Railway terminates TLS and supplies this header to the application service.
  // includeSubDomains/preload remain intentionally disabled until domain ownership
  // and the full subdomain inventory are verified.
  if (
    process.env.SECURITY_HSTS_ENABLED === 'true' &&
    req.headers['x-forwarded-proto'] === 'https'
  ) {
    headers['Strict-Transport-Security'] = 'max-age=31536000'
  }

  return headers
}

function writeResponseHead(res, req, status, headers = {}) {
  res.writeHead(status, { ...headers, ...securityHeaders(req) })
}

// Import the SSR server
const { default: server } = await import('./dist/server/server.js')

const httpServer = createServer(async (req, res) => {
  // Redirect HTTP → HTTPS (Railway sets x-forwarded-proto when TLS is terminated)
  if (req.headers['x-forwarded-proto'] === 'http') {
    const location = httpsRedirectLocation(req)
    if (location) {
      writeResponseHead(res, req, 301, { Location: location })
      res.end()
      return
    }
    // No configured origin to upgrade to. Serve the request rather than emit a
    // Location built from an unvalidated client Host; SECURITY_HSTS_ENABLED
    // covers the upgrade once the deployed domain is accepted.
  }

  const url = requestUrl(req)
  if (!url) {
    writeResponseHead(res, req, 400)
    res.end('Bad Request')
    return
  }

  // TanStack dev-only stylesheet — serve empty in production
  if (url.pathname.startsWith('/@tanstack-start/styles.css')) {
    writeResponseHead(res, req, 200, { 'Content-Type': 'text/css' })
    res.end('')
    return
  }

  // Try to serve static files from dist/client
  const filePath = normalize(resolve(clientDir, '.' + url.pathname))
  // Prevent path traversal — filePath must stay within clientDir
  if (url.pathname !== '/' && filePath.startsWith(clientDir) && existsSync(filePath)) {
    try {
      const data = readFileSync(filePath)
      const ext = extname(filePath)
      writeResponseHead(res, req, 200, {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Cache-Control': url.pathname.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
      })
      res.end(data)
      return
    } catch {}
  }

  // Fallback for mismatched CSS hashes (SSR vs client build)
  if (url.pathname.match(/\/assets\/styles-[^.]+\.css$/) && !existsSync(filePath)) {
    try {
      const assetsDir = join(clientDir, 'assets')
      const cssFile = readdirSync(assetsDir).find(f => f.startsWith('styles-') && f.endsWith('.css'))
      if (cssFile) {
        const data = readFileSync(join(assetsDir, cssFile))
        writeResponseHead(res, req, 200, { 'Content-Type': 'text/css', 'Cache-Control': 'public, max-age=3600' })
        res.end(data)
        return
      }
    } catch {}
  }

  // SSR handler
  try {
    const headers = {}
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers[key] = value
    }

    const request = new Request(url.href, {
      method: req.method,
      headers,
    })

    const response = await server.fetch(request)

    writeResponseHead(res, req, response.status, Object.fromEntries(response.headers.entries()))
    let body = await response.text()

    // Strip TanStack dev-only stylesheet links
    body = body.replace(/<link[^>]*@tanstack-start\/styles\.css[^>]*>/g, '')

    // Prevent FOUC: hide body until CSS + JS are ready
    body = body
      .replace('<body>', '<body style="opacity:0">')
      .replace('</body>', '<script>requestAnimationFrame(()=>requestAnimationFrame(()=>{document.body.style.opacity="1";document.body.style.transition="opacity .2s"}))</script></body>')

    res.end(body)
  } catch (err) {
    // Render errors routinely embed user-supplied content in their message and
    // stack, and process stdout/stderr is the one surface Sentry's scrubbing
    // does not cover. Log only the stable shape of the failure: error name,
    // method, and path. The query string is dropped for the same reason, and the
    // name is sanitised because a thrown object can carry an arbitrary one.
    const rawName = err instanceof Error ? err.name : typeof err
    const name = String(rawName).replace(/[^\w.$-]/g, '').slice(0, 64) || 'Unknown'
    console.error(`SSR Error: name=${name} method=${req.method} path=${url.pathname}`)
    writeResponseHead(res, req, 500)
    res.end('Internal Server Error')
  }
})

const port = process.env.PORT || 3000
httpServer.listen(port, '0.0.0.0', () => {
  const address = httpServer.address()
  const listeningPort = typeof address === 'object' && address ? address.port : port
  console.log(`Frontend server listening on http://0.0.0.0:${listeningPort}`)
})
