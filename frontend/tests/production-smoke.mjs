import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readdir, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { stopChild, waitForListeningPort } from './server-process.mjs'

const projectDir = fileURLToPath(new URL('..', import.meta.url))
const clientDir = fileURLToPath(new URL('../dist/client/', import.meta.url))

function assertBaselineSecurityHeaders(headers) {
  assert.equal(headers.get('x-content-type-options'), 'nosniff')
  assert.equal(headers.get('x-frame-options'), 'DENY')
  assert.equal(headers.get('referrer-policy'), 'strict-origin-when-cross-origin')
  assert.equal(headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()')
  assert.equal(headers.get('cross-origin-opener-policy'), 'same-origin')
  assert.equal(headers.get('cross-origin-resource-policy'), 'same-origin')
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
    env: { ...process.env, VITE_API_URL: apiUrl },
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
const backend = createServer((request, response) => {
  backendRequests.push({ method: request.method, url: request.url, origin: request.headers.origin })
  const corsOrigin = request.headers.origin ?? '*'

  if (request.method === 'GET' && request.url === '/api/v1/health') {
    response.writeHead(200, {
      'Access-Control-Allow-Origin': corsOrigin,
      'Content-Type': 'application/json',
    })
    response.end(JSON.stringify({ status: 'ok' }))
    return
  }

  response.writeHead(404, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify({ detail: 'not found' }))
})

let frontend
try {
  const backendOrigin = await listen(backend)
  const apiUrl = `${backendOrigin}/api/v1`
  await runBuild(apiUrl)
  await assertApiUrlIsInClientBuild(apiUrl)

  frontend = spawn(process.execPath, ['serve.mjs'], {
    cwd: projectDir,
    env: {
      ...process.env,
      PORT: '0',
      VITE_API_URL: apiUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const frontendPort = await waitForListeningPort(frontend)
  const frontendOrigin = `http://127.0.0.1:${frontendPort}`

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

  const health = await fetch(`${apiUrl}/health`, {
    headers: { Origin: frontendOrigin },
  })
  assert.equal(health.status, 200)
  assert.equal(health.headers.get('access-control-allow-origin'), frontendOrigin)
  assert.deepEqual(await health.json(), { status: 'ok' })
  assert.deepEqual(backendRequests, [
    { method: 'GET', url: '/api/v1/health', origin: frontendOrigin },
  ])

  console.log(`Production smoke passed: ${frontendOrigin} -> ${apiUrl}`)
} finally {
  if (frontend) await stopChild(frontend)
  await close(backend)
}
