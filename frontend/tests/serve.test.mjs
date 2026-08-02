import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import test from 'node:test'

const projectDir = new URL('..', import.meta.url)

async function availablePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

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

  const port = await availablePort()
  const child = spawn(process.execPath, ['serve.mjs'], {
    cwd: fixtureDir,
    env: {
      ...process.env,
      PORT: String(port),
      VITE_API_URL: 'https://api.example.test/api/v1',
      VITE_SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  t.after(async () => {
    child.kill()
    await rm(fixtureDir, { recursive: true, force: true })
  })

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('fixture server did not start')), 5_000)
    child.once('exit', (code) => reject(new Error(`fixture server exited with ${code}`)))
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('Frontend server listening')) {
        clearTimeout(timeout)
        resolve()
      }
    })
  })

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
