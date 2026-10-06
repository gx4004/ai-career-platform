import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { createServer, request as httpRequest } from 'node:http'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import test from 'node:test'

import { stopChild, waitForListeningPort } from './server-process.mjs'

const projectDir = new URL('..', import.meta.url)

const DEFAULT_SERVER_MODULE = `export default { fetch: async () => new Response(
      '<html><body>fixture</body></html>',
      { headers: { 'content-type': 'text/html' } },
    ) }`

// The full policy is pinned so that dropping or weakening any directive fails
// here instead of in a browser. `frame-src` is required by the CV Studio blob:
// PDF preview (src/components/cv-studio/CvPreview.tsx).
const EXPECTED_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "connect-src 'self' https://api.example.test",
  "font-src 'self'",
  "frame-src 'self' blob:",
  "img-src 'self' data: blob:",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
].join('; ')

async function startFixture(
  t,
  env = {},
  { serverModule = DEFAULT_SERVER_MODULE, clientFiles = {} } = {},
) {
  const fixtureDir = await mkdtemp(join(tmpdir(), 'career-workbench-serve-'))
  await mkdir(join(fixtureDir, 'dist', 'client', 'assets'), { recursive: true })
  await mkdir(join(fixtureDir, 'dist', 'server'), { recursive: true })
  await copyFile(new URL('../serve.mjs', import.meta.url), join(fixtureDir, 'serve.mjs'))
  await writeFile(join(fixtureDir, 'dist', 'client', 'assets', 'app.js'), 'console.log("fixture")')
  for (const [path, content] of Object.entries(clientFiles)) {
    await writeFile(join(fixtureDir, 'dist', 'client', path), content)
  }
  await writeFile(join(fixtureDir, 'dist', 'server', 'server.js'), serverModule)

  const child = spawn(process.execPath, ['serve.mjs'], {
    cwd: fixtureDir,
    env: {
      ...process.env,
      PORT: '0',
      VITE_API_URL: 'https://api.example.test/api/v1',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const diagnostics = { stderr: '' }
  child.stderr.on('data', (chunk) => {
    diagnostics.stderr += chunk.toString()
  })

  t.after(async () => {
    await stopChild(child)
    await rm(fixtureDir, { recursive: true, force: true })
  })

  const port = await waitForListeningPort(child, { timeoutMs: 5_000 })

  return { origin: `http://127.0.0.1:${port}`, port, child, diagnostics }
}

// `fetch` refuses to send a forged `Host`, so Host-header behaviour is exercised
// through the raw HTTP client, which also never follows redirects.
function rawRequest(port, { path = '/', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const clientRequest = httpRequest(
      { host: '127.0.0.1', port, path, method: 'GET', headers },
      (response) => {
        response.resume()
        response.on('end', () =>
          resolve({ status: response.statusCode, headers: response.headers }),
        )
      },
    )
    clientRequest.on('error', reject)
    clientRequest.end()
  })
}

// Like rawRequest, but keeps the body exactly as it came off the wire (no
// decoding), so transfer size and Content-Encoding can be asserted.
function wireRequest(port, { path = '/', method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const clientRequest = httpRequest(
      { host: '127.0.0.1', port, path, method, headers },
      (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks),
          }),
        )
      },
    )
    clientRequest.on('error', reject)
    clientRequest.end(body)
  })
}

function decode(response) {
  const encoding = response.headers['content-encoding']
  if (encoding === 'br') return brotliDecompressSync(response.body).toString()
  if (encoding === 'gzip') return gunzipSync(response.body).toString()
  return response.body.toString()
}

// A realistic, compressible bundle: repetitive JavaScript well over any
// compression threshold.
const BIG_BUNDLE = Array.from(
  { length: 400 },
  (_, i) => `export function component${i}(props) { return props.children ?? null }`,
).join('\n')

const BIG_HTML_MODULE = `export default { fetch: async () => new Response(
      '<!DOCTYPE html><html><head><title>Fixture</title></head><body><main>' +
        '<p class="lead">Server-rendered content the visitor must see.</p>'.repeat(200) +
        '</main></body></html>',
      { headers: { 'content-type': 'text/html; charset=utf-8' } },
    ) }`

async function startUpstream(t, handler) {
  const seen = []
  const upstream = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const record = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: Buffer.concat(chunks).toString(),
    }
    seen.push(record)
    handler(record, res)
  })
  upstream.listen(0, '127.0.0.1')
  await once(upstream, 'listening')
  t.after(() => new Promise((resolve) => upstream.close(resolve)))
  return { origin: `http://127.0.0.1:${upstream.address().port}`, seen }
}

async function waitForStderr(diagnostics, { timeoutMs = 2_000 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (diagnostics.stderr === '' && Date.now() < deadline) await delay(25)
  return diagnostics.stderr
}

function assertBaselineHeaders(headers) {
  assert.equal(headers.get('x-content-type-options'), 'nosniff')
  assert.equal(headers.get('x-frame-options'), 'DENY')
  assert.equal(headers.get('referrer-policy'), 'strict-origin-when-cross-origin')
  assert.equal(headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()')
  assert.equal(headers.get('cross-origin-opener-policy'), 'same-origin')
  assert.equal(headers.get('cross-origin-resource-policy'), 'same-origin')
}

test('frontend responses apply deployment-compatible security headers', async (t) => {
  const { origin } = await startFixture(t, {
    // Historical PostHog variables must not expand the current processor allowlist.
    VITE_PUBLIC_POSTHOG_HOST: 'https://us.i.posthog.com',
    VITE_PUBLIC_POSTHOG_INGESTION_HOST: 'https://posthog.example.test',
  })
  const html = await fetch(origin)
  const asset = await fetch(`${origin}/assets/app.js`)

  assertBaselineHeaders(html.headers)
  assertBaselineHeaders(asset.headers)
  assert.equal(html.headers.get('strict-transport-security'), null)
  assert.match(asset.headers.get('content-security-policy'), /default-src 'self'/)
  assert.match(
    html.headers.get('content-security-policy'),
    /connect-src 'self' https:\/\/api\.example\.test(;|$)/,
  )
  assert.match(
    html.headers.get('content-security-policy'),
    /font-src 'self'(;|$)/,
  )
  assert.doesNotMatch(html.headers.get('content-security-policy'), /posthog/)
})

test('served CSP pins every directive, including a blob: frame source', async (t) => {
  const { origin } = await startFixture(t)
  const html = await fetch(origin)
  const asset = await fetch(`${origin}/assets/app.js`)

  // The CV Studio preview frames a blob: URL. Chromium refuses that under
  // `default-src 'self'` ("Framing 'blob:…' violates … default-src 'self'"),
  // because blob: never matches 'self' or a host-source.
  assert.match(html.headers.get('content-security-policy'), /(^|; )frame-src 'self' blob:(;|$)/)
  // The blanket https: image source is gone; every real image is repo-local.
  assert.match(html.headers.get('content-security-policy'), /(^|; )img-src 'self' data: blob:(;|$)/)

  assert.equal(html.headers.get('content-security-policy'), EXPECTED_CSP)
  assert.equal(asset.headers.get('content-security-policy'), EXPECTED_CSP)
})

test('SSR failures log the error shape without the message or stack', async (t) => {
  const secret = 'ssr-error-payload-1f4c9a-resume-of-jane-doe'
  const { origin, diagnostics } = await startFixture(
    t,
    {},
    {
      serverModule: `export default { fetch: async () => {
        const error = new RangeError(${JSON.stringify(`rendering failed for ${secret}`)})
        throw error
      } }`,
    },
  )

  const response = await fetch(`${origin}/resume/result/${secret}-in-path`)
  assert.equal(response.status, 500)

  const logged = await waitForStderr(diagnostics)
  assert.match(logged, /SSR Error/)
  assert.match(logged, /RangeError/, 'SSR log dropped the error name needed to triage')
  assert.match(logged, /\/resume\/result\//, 'SSR log dropped the request path')
  assert.doesNotMatch(
    logged,
    /rendering failed for/,
    'SSR log leaked the error message to stdout, which is not scrubbed',
  )
  assert.doesNotMatch(logged, /\bat .*serve\.mjs/, 'SSR log leaked a stack trace to stdout')
})

test('a forged Host header is not echoed into the HTTPS redirect', async (t) => {
  const { port } = await startFixture(t, { FRONTEND_URL: 'https://app.example.test' })

  const forged = await rawRequest(port, {
    path: '/dashboard',
    headers: { Host: 'evil.attacker.test', 'x-forwarded-proto': 'http' },
  })

  assert.doesNotMatch(
    forged.headers.location ?? '',
    /evil\.attacker\.test/,
    'redirect Location reflected an unvalidated client Host header',
  )
  if (forged.status === 301) {
    assert.equal(forged.headers.location, 'https://app.example.test/dashboard')
  }
})

test('a configured Host still receives the HTTPS upgrade', async (t) => {
  const { port } = await startFixture(t, {
    CORS_ORIGINS: 'https://app.example.test,https://alt.example.test',
  })

  const upgraded = await rawRequest(port, {
    path: '/tools?tool=resume',
    headers: { Host: 'alt.example.test', 'x-forwarded-proto': 'http' },
  })

  assert.equal(upgraded.status, 301)
  assert.equal(upgraded.headers.location, 'https://alt.example.test/tools?tool=resume')
})

test('an unconfigured deployment emits no host-derived redirect at all', async (t) => {
  const { port } = await startFixture(t)

  const response = await rawRequest(port, {
    path: '/',
    headers: { Host: 'evil.attacker.test', 'x-forwarded-proto': 'http' },
  })

  assert.equal(response.status, 200)
  assert.equal(response.headers.location, undefined)
})

test('an unparseable Host header is rejected without killing the server', async (t) => {
  const { port, child } = await startFixture(t)

  const malformed = await rawRequest(port, { path: '/', headers: { Host: ']not-a-host[' } })
  assert.equal(malformed.status, 400)

  // The process must survive: an unhandled URL parse error would exit it.
  await delay(100)
  assert.equal(child.exitCode, null, 'server exited after a malformed Host header')
  const survivor = await rawRequest(port, { path: '/' })
  assert.equal(survivor.status, 200)
})

test('HSTS is emitted only for a trusted HTTPS-forwarded response', async (t) => {
  const { origin } = await startFixture(t, { SECURITY_HSTS_ENABLED: 'true' })
  const response = await fetch(origin, {
    headers: { 'x-forwarded-proto': 'https' },
  })

  assert.equal(
    response.headers.get('strict-transport-security'),
    'max-age=31536000',
  )
})

test('HSTS remains disabled until deployment TLS ownership is accepted', async (t) => {
  const { origin } = await startFixture(t)
  const response = await fetch(origin, {
    headers: { 'x-forwarded-proto': 'https' },
  })

  assert.equal(response.headers.get('strict-transport-security'), null)
})

// ── FE-1: compression, validators, caching ─────────────────────────────────

test('hashed assets are sent brotli- or gzip-compressed by Accept-Encoding', async (t) => {
  const { port } = await startFixture(t, {}, { clientFiles: { 'assets/index-abc123.js': BIG_BUNDLE } })
  const rawSize = Buffer.byteLength(BIG_BUNDLE)

  const br = await wireRequest(port, {
    path: '/assets/index-abc123.js',
    headers: { 'accept-encoding': 'gzip, deflate, br' },
  })
  assert.equal(br.status, 200)
  assert.equal(br.headers['content-encoding'], 'br')
  assert.match(br.headers.vary ?? '', /accept-encoding/i)
  assert.equal(Number(br.headers['content-length']), br.body.length)
  assert.ok(br.body.length < rawSize / 3, `brotli body ${br.body.length} B vs raw ${rawSize} B`)
  assert.equal(decode(br), BIG_BUNDLE)
  assert.equal(br.headers['content-type'], 'application/javascript')
  assert.equal(br.headers['cache-control'], 'public, max-age=31536000, immutable')
  assert.equal(br.headers['x-content-type-options'], 'nosniff')

  const gzip = await wireRequest(port, {
    path: '/assets/index-abc123.js',
    headers: { 'accept-encoding': 'gzip' },
  })
  assert.equal(gzip.headers['content-encoding'], 'gzip')
  assert.equal(Number(gzip.headers['content-length']), gzip.body.length)
  assert.equal(decode(gzip), BIG_BUNDLE)

  const identity = await wireRequest(port, { path: '/assets/index-abc123.js' })
  assert.equal(identity.headers['content-encoding'], undefined)
  assert.equal(identity.body.toString(), BIG_BUNDLE)
  assert.match(identity.headers.vary ?? '', /accept-encoding/i)

  // q=0 means "not acceptable"; the server must fall back, not ignore it.
  const refusesBrotli = await wireRequest(port, {
    path: '/assets/index-abc123.js',
    headers: { 'accept-encoding': 'br;q=0, gzip' },
  })
  assert.equal(refusesBrotli.headers['content-encoding'], 'gzip')
})

test('already-compressed files are sent as they are', async (t) => {
  const font = Buffer.alloc(4096, 7)
  const { port } = await startFixture(t, {}, { clientFiles: { 'assets/face.woff2': font } })

  const response = await wireRequest(port, {
    path: '/assets/face.woff2',
    headers: { 'accept-encoding': 'br, gzip' },
  })
  assert.equal(response.status, 200)
  assert.equal(response.headers['content-encoding'], undefined)
  assert.equal(response.headers['content-type'], 'font/woff2')
  assert.deepEqual(response.body, font)
})

test('static files carry an ETag per encoding and answer a matching If-None-Match with 304', async (t) => {
  const { port } = await startFixture(t, {}, { clientFiles: { 'assets/index-abc123.js': BIG_BUNDLE } })
  const path = '/assets/index-abc123.js'

  const br = await wireRequest(port, { path, headers: { 'accept-encoding': 'br' } })
  const plain = await wireRequest(port, { path })
  assert.ok(br.headers.etag, 'compressed response has an ETag')
  assert.ok(plain.headers.etag, 'identity response has an ETag')
  assert.notEqual(br.headers.etag, plain.headers.etag, 'different bytes need different validators')

  const revalidated = await wireRequest(port, {
    path,
    headers: { 'accept-encoding': 'br', 'if-none-match': br.headers.etag },
  })
  assert.equal(revalidated.status, 304)
  assert.equal(revalidated.body.length, 0)
  assert.equal(revalidated.headers.etag, br.headers.etag)

  const stale = await wireRequest(port, { path, headers: { 'if-none-match': '"something-else"' } })
  assert.equal(stale.status, 200)
  assert.equal(stale.body.toString(), BIG_BUNDLE)
})

test('non-hashed public files keep a short cache lifetime', async (t) => {
  const { port } = await startFixture(t, {}, { clientFiles: { 'robots.txt': 'User-agent: *\nAllow: /\n' } })
  const response = await wireRequest(port, { path: '/robots.txt' })
  assert.equal(response.status, 200)
  assert.equal(response.headers['cache-control'], 'public, max-age=3600')
  assert.equal(response.body.toString(), 'User-agent: *\nAllow: /\n')
})

test('static lookups never escape the client directory', async (t) => {
  const { port } = await startFixture(t)
  const escape = await wireRequest(port, { path: '/assets/../../serve.mjs' })
  assert.doesNotMatch(escape.body.toString(), /createServer/)
})

test('server-rendered HTML is gzip-compressed when the browser accepts it', async (t) => {
  const { port } = await startFixture(t, {}, { serverModule: BIG_HTML_MODULE })

  const compressed = await wireRequest(port, {
    path: '/',
    headers: { 'accept-encoding': 'gzip, deflate, br' },
  })
  assert.equal(compressed.status, 200)
  assert.equal(compressed.headers['content-encoding'], 'gzip')
  assert.match(compressed.headers.vary ?? '', /accept-encoding/i)
  const html = decode(compressed)
  assert.match(html, /Server-rendered content the visitor must see\./)

  const plain = await wireRequest(port, { path: '/' })
  assert.equal(plain.headers['content-encoding'], undefined)
  assert.ok(compressed.body.length < plain.body.length / 5)
  assert.equal(decode(plain), html)
})

// ── FE-2: the page is visible before JavaScript runs ─────────────────────────

test('server-rendered HTML is not hidden until JavaScript runs', async (t) => {
  const { port } = await startFixture(t, {}, { serverModule: BIG_HTML_MODULE })
  const html = decode(await wireRequest(port, { path: '/' }))

  assert.match(html, /<body>/, 'the body tag is sent untouched')
  assert.doesNotMatch(html, /opacity\s*:\s*0/, 'SSR content must paint without waiting for JS')
  assert.doesNotMatch(html, /document\.body\.style\.opacity/)
})

// ── CFG-1: optional same-origin /api reverse proxy ───────────────────────────

test('with API_PROXY_TARGET set, /api requests reach the backend with forwarding headers', async (t) => {
  const upstream = await startUpstream(t, (record, res) => {
    res.writeHead(201, [
      'Content-Type', 'application/json',
      'Set-Cookie', 'access_token=a; Path=/api; HttpOnly; SameSite=Lax',
      'Set-Cookie', 'refresh_token=r; Path=/api/v1/auth; HttpOnly; SameSite=Lax',
      'X-Request-ID', 'upstream-request-id',
    ])
    res.end(JSON.stringify({ ok: true, echoed: record.body }))
  })
  const { port } = await startFixture(t, { API_PROXY_TARGET: upstream.origin })

  const response = await wireRequest(port, {
    path: '/api/v1/auth/login?next=%2Fdashboard',
    method: 'POST',
    headers: {
      Host: 'app.example.test',
      'content-type': 'application/json',
      cookie: 'refresh_token=r',
      'x-forwarded-for': '203.0.113.7',
      'x-forwarded-proto': 'https',
    },
    body: JSON.stringify({ email: 'x@example.com' }),
  })

  assert.equal(response.status, 201)
  assert.deepEqual(JSON.parse(response.body.toString()), {
    ok: true,
    echoed: JSON.stringify({ email: 'x@example.com' }),
  })
  assert.deepEqual(response.headers['set-cookie'], [
    'access_token=a; Path=/api; HttpOnly; SameSite=Lax',
    'refresh_token=r; Path=/api/v1/auth; HttpOnly; SameSite=Lax',
  ])
  assert.equal(response.headers['x-request-id'], 'upstream-request-id')

  assert.equal(upstream.seen.length, 1)
  const [forwarded] = upstream.seen
  assert.equal(forwarded.method, 'POST')
  assert.equal(forwarded.url, '/api/v1/auth/login?next=%2Fdashboard')
  assert.equal(forwarded.headers.cookie, 'refresh_token=r')
  assert.equal(forwarded.headers['content-type'], 'application/json')
  // The proxy appends the address it received the request from, so the backend
  // can key limits on the real client once it trusts this hop.
  assert.equal(forwarded.headers['x-forwarded-for'], '203.0.113.7, 127.0.0.1')
  assert.equal(forwarded.headers['x-forwarded-proto'], 'https')
  assert.equal(forwarded.headers['x-forwarded-host'], 'app.example.test')
})

test('the proxy sets X-Forwarded-For and -Proto itself when no edge supplied them', async (t) => {
  const upstream = await startUpstream(t, (_record, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{}')
  })
  const { port } = await startFixture(t, { API_PROXY_TARGET: upstream.origin })

  const response = await wireRequest(port, { path: '/api/v1/health' })
  assert.equal(response.status, 200)
  assert.equal(upstream.seen[0].headers['x-forwarded-for'], '127.0.0.1')
  assert.equal(upstream.seen[0].headers['x-forwarded-proto'], 'http')
})

test('an unreachable backend is answered with 502, not a crash', async (t) => {
  const { port, child } = await startFixture(t, { API_PROXY_TARGET: 'http://127.0.0.1:9' })

  const response = await wireRequest(port, { path: '/api/v1/auth/me' })
  assert.equal(response.status, 502)
  assert.deepEqual(JSON.parse(response.body.toString()), { detail: 'Bad gateway' })
  await delay(50)
  assert.equal(child.exitCode, null)
})

test('without API_PROXY_TARGET, /api paths are not proxied anywhere', async (t) => {
  const upstream = await startUpstream(t, (_record, res) => res.end('{}'))
  const { port } = await startFixture(t)

  const response = await wireRequest(port, { path: '/api/v1/health' })
  assert.equal(upstream.seen.length, 0)
  assert.equal(decode(response), '<html><body>fixture</body></html>')
})
