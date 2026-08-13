import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import test from 'node:test'

import { stopChild, waitForListeningPort } from './server-process.mjs'

const projectDir = new URL('..', import.meta.url)

async function startFixture(t, env = {}) {
  const fixtureDir = await mkdtemp(join(tmpdir(), 'career-workbench-serve-'))
  await mkdir(join(fixtureDir, 'dist', 'client', 'assets'), { recursive: true })
  await mkdir(join(fixtureDir, 'dist', 'server'), { recursive: true })
  await copyFile(new URL('../serve.mjs', import.meta.url), join(fixtureDir, 'serve.mjs'))
  await writeFile(join(fixtureDir, 'dist', 'client', 'assets', 'app.js'), 'console.log("fixture")')
  await writeFile(
    join(fixtureDir, 'dist', 'server', 'server.js'),
    `export default { fetch: async () => new Response(
      '<html><body>fixture</body></html>',
      { headers: { 'content-type': 'text/html' } },
    ) }`,
  )

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

  t.after(async () => {
    await stopChild(child)
    await rm(fixtureDir, { recursive: true, force: true })
  })

  const port = await waitForListeningPort(child, { timeoutMs: 5_000 })

  return `http://127.0.0.1:${port}`
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
  const origin = await startFixture(t, {
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

test('HSTS is emitted only for a trusted HTTPS-forwarded response', async (t) => {
  const origin = await startFixture(t, { SECURITY_HSTS_ENABLED: 'true' })
  const response = await fetch(origin, {
    headers: { 'x-forwarded-proto': 'https' },
  })

  assert.equal(
    response.headers.get('strict-transport-security'),
    'max-age=31536000',
  )
})

test('HSTS remains disabled until deployment TLS ownership is accepted', async (t) => {
  const origin = await startFixture(t)
  const response = await fetch(origin, {
    headers: { 'x-forwarded-proto': 'https' },
  })

  assert.equal(response.headers.get('strict-transport-security'), null)
})
