import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readdir, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from '@playwright/test'

import { stopChild, waitForListeningPort } from './server-process.mjs'

const projectDir = fileURLToPath(new URL('..', import.meta.url))
const clientDir = fileURLToPath(new URL('../dist/client/', import.meta.url))
const defaultDarkEnvironment = {
  VITE_R7_CONTEXT_CARRY: 'false',
  VITE_R7_ENTRY_CHOICE: 'false',
  VITE_R7_NEXT_BEST_ACTION: 'false',
  VITE_R7_RESULTS_NUDGE: 'false',
  VITE_R7_SAMPLE_QUICKFILL: 'false',
  VITE_R7_VALUE_SPECIFIC_SIGNUP: 'false',
  VITE_R11_EVIDENCE_PROFILE_ENABLED: 'false',
  VITE_R12_CV_STUDIO_ENABLED: 'false',
  VITE_R13_CAMPAIGNS_ENABLED: 'false',
  VITE_R14_DISCOVERY_ENABLED: 'false',
  VITE_R15_QUEUE_ENABLED: 'false',
  VITE_R16_SUBMISSION_FOUNDATION_ENABLED: 'false',
  VITE_R17_DEVELOPMENT_LOOP_ENABLED: 'false',
  VITE_SENTRY_DSN: '',
}

function assertBaselineSecurityHeaders(headers) {
  assert.equal(headers.get('x-content-type-options'), 'nosniff')
  assert.equal(headers.get('x-frame-options'), 'DENY')
  assert.equal(headers.get('referrer-policy'), 'strict-origin-when-cross-origin')
  assert.equal(headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()')
  assert.equal(headers.get('cross-origin-opener-policy'), 'same-origin')
  assert.equal(headers.get('cross-origin-resource-policy'), 'same-origin')

  const csp = headers.get('content-security-policy') ?? ''
  // Served by the real built artifact, not the dev server: the dev server never
  // sends this policy, so the CV Studio blob: preview can only regress here.
  assert.match(
    csp,
    /(^|; )frame-src 'self' blob:(;|$)/,
    `served CSP lacks the blob: frame source the CV Studio preview needs: ${csp}`,
  )
  assert.match(
    csp,
    /(^|; )img-src 'self' data: blob:(;|$)/,
    `served CSP image sources drifted from the repo-local set: ${csp}`,
  )
}

async function listen(server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert(address && typeof address === 'object')
  return `http://127.0.0.1:${address.port}`
}

async function close(server) {
  if (!server.listening) return
  const closed = once(server, 'close')
  server.close()
  await closed
}

async function runBuild(apiUrl) {
  const child = spawn('pnpm', ['build'], {
    cwd: projectDir,
    env: { ...process.env, ...defaultDarkEnvironment, VITE_API_URL: apiUrl },
    stdio: 'inherit',
  })
  const [code, signal] = await once(child, 'exit')
  assert.equal(signal, null, `production build terminated with signal ${signal}`)
  assert.equal(code, 0, `production build exited with code ${code}`)
}

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await filesBelow(path)))
    else files.push(path)
  }
  return files
}

async function assertApiUrlIsInClientBuild(apiUrl) {
  const files = await filesBelow(clientDir)
  const scripts = files.filter((path) => path.endsWith('.js'))
  assert(scripts.length > 0, 'production client build contains no JavaScript assets')

  for (const script of scripts) {
    if ((await readFile(script, 'utf8')).includes(apiUrl)) return
  }
  assert.fail(`production client assets do not contain configured API URL ${apiUrl}`)
}

const backendRequests = []
let allowedFrontendOrigin

function fixtureHeaders(request) {
  const headers = { 'Content-Type': 'application/json' }
  if (request.headers.origin === allowedFrontendOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedFrontendOrigin
    headers['Access-Control-Allow-Credentials'] = 'true'
    headers.Vary = 'Origin'
  }
  return headers
}

const backend = createServer((request, response) => {
  backendRequests.push({
    method: request.method,
    url: request.url,
    origin: request.headers.origin,
    cookie: request.headers.cookie,
  })

  if (request.method === 'OPTIONS' && request.headers.origin === allowedFrontendOrigin) {
    response.writeHead(204, {
      ...fixtureHeaders(request),
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    })
    response.end()
    return
  }

  if (request.method === 'GET' && request.url === '/api/v1/health') {
    response.writeHead(200, fixtureHeaders(request))
    response.end(JSON.stringify({ status: 'ok' }))
    return
  }

  if (request.method === 'GET' && request.url === '/api/v1/auth/me') {
    response.writeHead(200, fixtureHeaders(request))
    response.end(
      JSON.stringify({
        id: 'production-smoke-user',
        email: 'production-smoke@example.invalid',
        full_name: 'Production Smoke',
        is_active: true,
        is_admin: false,
      }),
    )
    return
  }

  if (request.method === 'GET' && request.url === '/api/v1/auth/providers') {
    response.writeHead(200, fixtureHeaders(request))
    response.end(JSON.stringify({ providers: [] }))
    return
  }

  if (request.method === 'POST' && request.url === '/api/v1/telemetry/events') {
    response.writeHead(200, fixtureHeaders(request))
    response.end(JSON.stringify({ accepted: true }))
    return
  }

  response.writeHead(404, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify({ detail: 'not found' }))
})

let frontend
let browser
try {
  const backendOrigin = await listen(backend)
  const apiUrl = `${backendOrigin}/api/v1`
  await runBuild(apiUrl)
  await assertApiUrlIsInClientBuild(apiUrl)

  frontend = spawn(process.execPath, ['serve.mjs'], {
    cwd: projectDir,
    env: {
      ...process.env,
      ...defaultDarkEnvironment,
      PORT: '0',
      VITE_API_URL: apiUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const frontendPort = await waitForListeningPort(frontend)
  const frontendOrigin = `http://127.0.0.1:${frontendPort}`
  allowedFrontendOrigin = frontendOrigin

  const root = await fetch(`${frontendOrigin}/`)
  assert.equal(root.status, 200)
  assert.match(root.headers.get('content-type') ?? '', /^text\/html\b/)
  assertBaselineSecurityHeaders(root.headers)
  assert.match(root.headers.get('content-security-policy') ?? '', /default-src 'self'/)
  assert(
    (root.headers.get('content-security-policy') ?? '').includes(backendOrigin),
    'root CSP does not allow the configured fixture backend origin',
  )

  const html = await root.text()
  assert.match(html, /<title>Career Workbench<\/title>/)
  assert.match(html, /id="\$tsr-stream-barrier"/)
  assert.match(html, /self\.\$_TSR=/)
  assert.match(html, /<script[^>]*type="module"[^>]*src="\/assets\/[^\"]+\.js"/)

  const assetPaths = [
    ...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+\.(?:css|js))"/g),
  ].map((match) => match[1])
  assert(assetPaths.length > 0, 'SSR root does not reference a built CSS or JavaScript asset')

  const asset = await fetch(`${frontendOrigin}${assetPaths[0]}`)
  assert.equal(asset.status, 200)
  assertBaselineSecurityHeaders(asset.headers)
  assert.match(asset.headers.get('cache-control') ?? '', /\bimmutable\b/)
  assert.match(asset.headers.get('content-type') ?? '', /(?:javascript|text\/css)/)
  assert((await asset.arrayBuffer()).byteLength > 0, 'built static asset is empty')

  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  await context.addCookies([
    {
      name: 'production_smoke_session',
      value: 'credentialed-browser-request',
      url: backendOrigin,
      sameSite: 'Lax',
    },
  ])
  await context.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  )
  await context.route('https://fonts.gstatic.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'font/woff2', body: '' }),
  )

  const page = await context.newPage()
  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(`${message.text()} (${message.location().url})`)
    }
  })

  await page.goto(frontendOrigin, { waitUntil: 'domcontentloaded' })
  await page.locator('html[data-hydrated="true"]').waitFor()
  assert.equal(await page.title(), 'Career Workbench')
  await page.waitForLoadState('networkidle')

  const healthResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${apiUrl}/health` && response.request().method() === 'GET',
  )
  const browserHealthPromise = page.evaluate(async (healthUrl) => {
    const response = await fetch(healthUrl, { credentials: 'include' })
    return { status: response.status, body: await response.json() }
  }, `${apiUrl}/health`)
  const [healthResponse, browserHealth] = await Promise.all([
    healthResponsePromise,
    browserHealthPromise,
  ])

  assert.deepEqual(browserHealth, { status: 200, body: { status: 'ok' } })
  assert.equal(
    (await healthResponse.allHeaders())['access-control-allow-origin'],
    frontendOrigin,
  )
  assert.equal(
    (await healthResponse.allHeaders())['access-control-allow-credentials'],
    'true',
  )
  assert(
    backendRequests.some(
      (request) =>
        request.method === 'GET' &&
        request.url === '/api/v1/health' &&
        request.origin === frontendOrigin &&
        request.cookie?.includes('production_smoke_session=credentialed-browser-request'),
    ),
    'fixture backend did not observe a browser-origin credentialed health request',
  )
  assert.deepEqual(pageErrors, [], `browser page errors:\n${pageErrors.join('\n')}`)
  assert.deepEqual(consoleErrors, [], `browser console errors:\n${consoleErrors.join('\n')}`)

  console.log(`Production smoke passed: ${frontendOrigin} -> ${apiUrl}`)
} finally {
  if (browser) await browser.close()
  if (frontend) await stopChild(frontend)
  await close(backend)
}
