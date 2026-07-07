import assert from 'node:assert/strict'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const root = new URL('..', import.meta.url).pathname
const clientAssetsDir = join(root, 'dist', 'client', 'assets')
const kib = 1024
let buildHasRun = false

function buildProductionClient() {
  if (buildHasRun) return

  const result = spawnSync('pnpm', ['build'], {
    cwd: root,
    encoding: 'utf8',
  })

  assert.equal(
    result.status,
    0,
    `pnpm build failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  )
  buildHasRun = true
}

function assetSizeKiB(fileName) {
  return statSync(join(clientAssetsDir, fileName)).size / kib
}

test('production client keeps main JavaScript under the R4 baseline budget', () => {
  buildProductionClient()

  const mainBundle = readdirSync(clientAssetsDir).find((file) =>
    /^main-[\w-]+\.js$/.test(file),
  )

  assert.ok(mainBundle, 'main client JavaScript bundle was not emitted')

  const sizeKiB = assetSizeKiB(mainBundle)
  assert.ok(
    sizeKiB < 540,
    `main client JavaScript is ${sizeKiB.toFixed(1)} KiB, expected < 540 KiB`,
  )
})

test('production client keeps total CSS under the R4 baseline budget', () => {
  buildProductionClient()

  const cssFiles = readdirSync(clientAssetsDir).filter((file) =>
    file.endsWith('.css'),
  )

  assert.ok(cssFiles.length > 0, 'no production CSS assets were emitted')

  const totalKiB = cssFiles.reduce((sum, file) => sum + assetSizeKiB(file), 0)
  assert.ok(
    totalKiB < 480,
    `production CSS total is ${totalKiB.toFixed(1)} KiB, expected < 480 KiB`,
  )
})
