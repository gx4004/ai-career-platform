import { createServer, request as httpRequest, Agent as HttpAgent } from 'node:http'
import { request as httpsRequest, Agent as HttpsAgent } from 'node:https'
import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { brotliCompress, gzip, constants as zlibConstants } from 'node:zlib'
import { join, extname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const clientDir = join(__dirname, 'dist', 'client')

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const brotliAsync = promisify(brotliCompress)
const gzipAsync = promisify(gzip)

// Text formats worth compressing; fonts and images are already compressed.
const COMPRESSIBLE_EXTENSIONS = new Set(['.html', '.js', '.css', '.json', '.txt', '.xml', '.svg', '.ico'])
const COMPRESSIBLE_TYPE = /^(text\/|application\/(javascript|json|xml)|image\/svg\+xml)/
const MIN_COMPRESS_BYTES = 1024

async function listFiles(dir) {
  const files = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await listFiles(path)))
    else if (entry.isFile()) files.push(path)
  }
  return files
}

function etagFor(data, suffix = '') {
  return `"${createHash('sha1').update(data).digest('base64url')}${suffix}"`
}

// dist/client is immutable after a build, so every file is read once at start-up
// and kept in memory with its compressed variants: requests never touch the disk
// and never pay brotli's maximum quality, which costs about a second of CPU for
// the main chunk. Only files that exist here can be served, which also rules out
// path traversal.
async function loadStaticFiles() {
  const files = new Map()
  let paths = []
  try {
    paths = await listFiles(clientDir)
  } catch {
    return files
  }
  await Promise.all(
    paths.map(async (path) => {
      const data = await readFile(path)
      const ext = extname(path)
      const urlPath = '/' + relative(clientDir, path).split(sep).join('/')
      const tag = etagFor(data)
      const entry = {
        type: mimeTypes[ext] || 'application/octet-stream',
        cacheControl: urlPath.startsWith('/assets/')
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=3600',
        compressible: COMPRESSIBLE_EXTENSIONS.has(ext),
        variants: { identity: { data, etag: tag } },
      }
      if (entry.compressible && data.length >= MIN_COMPRESS_BYTES) {
        const [br, gz] = await Promise.all([
          brotliAsync(data, {
            params: {
              [zlibConstants.BROTLI_PARAM_QUALITY]: zlibConstants.BROTLI_MAX_QUALITY,
              [zlibConstants.BROTLI_PARAM_SIZE_HINT]: data.length,
            },
          }),
          gzipAsync(data, { level: 9 }),
        ])
        if (br.length < data.length) entry.variants.br = { data: br, etag: tag.replace(/"$/, '-br"') }
        if (gz.length < data.length) entry.variants.gzip = { data: gz, etag: tag.replace(/"$/, '-gz"') }
      }
      files.set(urlPath, entry)
    }),
  )
  return files
}

// Accept-Encoding with q-values: "br;q=0, gzip" refuses brotli.
function acceptsEncoding(header, encoding) {
  let wildcard = 0
  for (const part of (header ?? '').split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';')
    let q = 1
    for (const param of params) {
      const [key, value] = param.trim().split('=')
      if (key === 'q') q = Number(value)
    }
    if (!Number.isFinite(q)) q = 0
    if (name === encoding) return q > 0
    if (name === '*') wildcard = q
  }
  return wildcard > 0
}

function matchesEtag(header, etag) {
  if (!header) return false
  return header.split(',').some((candidate) => {
    const value = candidate.trim()
    return value === '*' || value === etag || value === `W/${etag}`
  })
}

function sendStatic(req, res, entry, cacheControl = entry.cacheControl) {
  const encoding = ['br', 'gzip'].find(
    (name) => entry.variants[name] && acceptsEncoding(req.headers['accept-encoding'], name),
  )
  const variant = entry.variants[encoding ?? 'identity']
  const headers = {
    'Content-Type': entry.type,
    'Cache-Control': cacheControl,
    ETag: variant.etag,
  }
  if (entry.compressible) headers.Vary = 'Accept-Encoding'
  if (matchesEtag(req.headers['if-none-match'], variant.etag)) {
    writeResponseHead(res, req, 304, headers)
    res.end()
    return
  }
  if (encoding) headers['Content-Encoding'] = encoding
  headers['Content-Length'] = variant.data.length
  writeResponseHead(res, req, 200, headers)
  res.end(variant.data)
}

// Optional same-origin API: with API_PROXY_TARGET set (for example the backend's
// private-network URL), /api/* is forwarded there, so the browser talks to one
// origin and the SameSite=Lax, Path=/api cookies just work. Build the frontend
// without VITE_API_URL in that topology so the client calls the relative /api/v1.
const apiProxyTarget = configuredOrigin(process.env.API_PROXY_TARGET)
if (process.env.API_PROXY_TARGET && !apiProxyTarget) {
  throw new Error('API_PROXY_TARGET must be an http(s) URL')
}
// No keep-alive: uvicorn closes idle connections after a few seconds, and
// reusing a socket it is closing would fail a non-idempotent POST.
const proxyAgent = apiProxyTarget?.startsWith('https:')
  ? new HttpsAgent({ keepAlive: false })
  : new HttpAgent({ keepAlive: false })

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

function isApiPath(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/')
}

function proxyToApi(req, res, url) {
  const connectionTokens = new Set(
    (req.headers.connection ?? '').split(',').map((token) => token.trim().toLowerCase()),
  )
  const headers = {}
  for (const [name, value] of Object.entries(req.headers)) {
    if (HOP_BY_HOP_HEADERS.has(name) || connectionTokens.has(name) || name === 'host') continue
    headers[name] = value
  }
  // Append the peer this server saw; the backend trusts the chain only as far
  // as FORWARDED_ALLOW_IPS says (see backend/start.sh).
  const peer = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '')
  const forwardedFor = req.headers['x-forwarded-for']
  headers['x-forwarded-for'] = forwardedFor ? `${forwardedFor}, ${peer}` : peer
  headers['x-forwarded-proto'] = req.headers['x-forwarded-proto'] ?? 'http'
  headers['x-forwarded-host'] = req.headers['x-forwarded-host'] ?? req.headers.host ?? ''

  // The target path comes from the parsed URL, never the raw request target, so
  // an absolute-form request line cannot redirect the proxy elsewhere.
  const target = new URL(url.pathname + url.search, apiProxyTarget)
  const send = target.protocol === 'https:' ? httpsRequest : httpRequest
  const upstream = send(target, { method: req.method, headers, agent: proxyAgent }, (upstreamRes) => {
    const responseHeaders = []
    for (let i = 0; i < upstreamRes.rawHeaders.length; i += 2) {
      const name = upstreamRes.rawHeaders[i]
      if (HOP_BY_HOP_HEADERS.has(name.toLowerCase())) continue
      responseHeaders.push(name, upstreamRes.rawHeaders[i + 1])
    }
    res.writeHead(upstreamRes.statusCode ?? 502, responseHeaders)
    // pipe() only ends the browser response on 'end'; a backend that dies mid-body must not leave it hanging.
    upstreamRes.on('aborted', () => res.destroy())
    upstreamRes.on('error', () => res.destroy())
    upstreamRes.pipe(res)
  })
  let clientGone = false
  upstream.on('error', (err) => {
    if (clientGone) return
    console.error(`API proxy error: code=${err.code ?? err.name} method=${req.method} path=${url.pathname}`)
    if (res.headersSent) {
      res.destroy()
      return
    }
    const body = '{"detail":"Bad gateway"}'
    writeResponseHead(res, req, 502, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    })
    res.end(body)
  })
  // A browser that goes away (navigation, closed tab) must not keep the
  // backend request alive on its behalf.
  res.on('close', () => {
    if (res.writableFinished) return
    clientGone = true
    upstream.destroy()
  })
  req.pipe(upstream)
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
  const apiOrigin = configuredOrigin(process.env.VITE_API_URL)
  if (apiOrigin) connectOrigins.add(apiOrigin)

  const headers = {
    'Content-Security-Policy': [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      `connect-src ${[...connectOrigins].join(' ')}`,
      // Fonts are self-hosted (@fontsource woff2 files under /assets/); no third-party font host.
      "font-src 'self'",
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
      "style-src 'self' 'unsafe-inline'",
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
const staticFiles = await loadStaticFiles()

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

  if (apiProxyTarget && isApiPath(url.pathname)) {
    proxyToApi(req, res, url)
    return
  }

  const staticFile = staticFiles.get(url.pathname)
  if (staticFile) {
    sendStatic(req, res, staticFile)
    return
  }

  // Fallback for mismatched CSS hashes (SSR vs client build)
  if (/^\/assets\/styles-[^/.]+\.css$/.test(url.pathname)) {
    const cssPath = [...staticFiles.keys()].find((path) => /^\/assets\/styles-[^/]+\.css$/.test(path))
    if (cssPath) {
      sendStatic(req, res, staticFiles.get(cssPath), 'public, max-age=3600')
      return
    }
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

    const responseHeaders = Object.fromEntries(response.headers.entries())
    let body = await response.text()

    // Strip TanStack dev-only stylesheet links
    body = body.replace(/<link[^>]*@tanstack-start\/styles\.css[^>]*>/g, '')

    // gzip at level 6 on the fly: cheap for a page of HTML (brotli at a useful
    // quality is not), and most of the first paint's bytes.
    let payload = body
    const compressible =
      COMPRESSIBLE_TYPE.test(responseHeaders['content-type'] ?? '') &&
      !responseHeaders['content-encoding']
    if (compressible) {
      responseHeaders.vary = responseHeaders.vary ? `${responseHeaders.vary}, Accept-Encoding` : 'Accept-Encoding'
      if (
        Buffer.byteLength(body) >= MIN_COMPRESS_BYTES &&
        acceptsEncoding(req.headers['accept-encoding'], 'gzip')
      ) {
        payload = await gzipAsync(body, { level: 6 })
        responseHeaders['content-encoding'] = 'gzip'
        responseHeaders['content-length'] = String(payload.length)
      }
    }
    if (payload === body) delete responseHeaders['content-length']

    writeResponseHead(res, req, response.status, responseHeaders)
    res.end(payload)
  } catch (err) {
    // Render errors routinely embed user-supplied content in their message and
    // stack, and process stdout/stderr is not scrubbed. Log only the stable
    // shape of the failure: error name, method, and path. The query string is dropped for the same reason, and the
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
