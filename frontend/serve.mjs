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
      "img-src 'self' data: blob: https:",
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
    writeResponseHead(res, req, 301, { Location: `https://${req.headers.host}${req.url}` })
    res.end()
    return
  }

  const url = new URL(req.url, `http://${req.headers.host}`)

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
    console.error('SSR Error:', err)
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
