import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { request as httpRequest } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
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
  "connect-src 'self' https://api.example.test https://example.ingest.sentry.io",
  "font-src 'self' https://fonts.gstatic.com",
  "frame-src 'self' blob:",
  "img-src 'self' data: blob:",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "worker-src 'self' blob:",
].join('; ')

async function startFixture(t, env = {}, { serverModule = DEFAULT_SERVER_MODULE } = {}) {
  const fixtureDir = await mkdtemp(join(tmpdir(), 'career-workbench-serve-'))
  await mkdir(join(fixtureDir, 'dist', 'client', 'assets'), { recursive: true })
  await mkdir(join(fixtureDir, 'dist', 'server'), { recursive: true })
  await copyFile(new URL('../serve.mjs', import.meta.url), join(fixtureDir, 'serve.mjs'))
  await writeFile(join(fixtureDir, 'dist', 'client', 'assets', 'app.js'), 'console.log("fixture")')
  await writeFile(join(fixtureDir, 'dist', 'server', 'server.js'), serverModule)

  const child = spawn(process.execPath, ['serve.mjs'], {
    cwd: fixtureDir,
    env: {
      ...process.env,
      PORT: '0',
      VITE_API_URL: 'https://api.example.test/api/v1',
      VITE_SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
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
    /connect-src 'self' https:\/\/api\.example\.test https:\/\/example\.ingest\.sentry\.io/,
  )
  assert.match(
    html.headers.get('content-security-policy'),
    /font-src 'self' https:\/\/fonts\.gstatic\.com/,
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
    'SSR log leaked the error message to stdout, which Sentry scrubbing does not cover',
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
