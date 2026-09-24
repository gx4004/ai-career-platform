import assert from 'node:assert/strict'
import test from 'node:test'

import { STATIC_PAGES, VIEWPORTS, buildSummary, outputPath } from '../e2e/screenshot-utils.mjs'

test('static page manifest has unique names, absolute paths, and a known auth tier', () => {
  const names = STATIC_PAGES.map((page) => page.name)
  assert.equal(new Set(names).size, names.length, 'page names must be unique')
  for (const page of STATIC_PAGES) {
    assert.ok(page.path.startsWith('/'), `${page.name} path must be absolute`)
    assert.ok(
      ['guest', 'user', 'admin'].includes(page.auth),
      `${page.name} auth tier must be guest, user, or admin`,
    )
  }
})

test('static page manifest covers the requested surfaces', () => {
  const names = new Set(STATIC_PAGES.map((page) => page.name))
  for (const expected of [
    'landing',
    'login',
    'dashboard',
    'resume-input',
    'job-match-input',
    'career-input',
    'cover-letter-input',
    'interview-input',
    'portfolio-input',
    'history',
    'settings',
    'account',
    'cv-studio',
    'profile',
    'development-plan',
    'discovery',
    'queue',
    'admin',
  ]) {
    assert.ok(names.has(expected), `manifest is missing "${expected}"`)
  }
})

test('viewport manifest matches the desktop/mobile spec', () => {
  assert.deepEqual(VIEWPORTS.desktop, { width: 1440, height: 900 })
  assert.deepEqual(VIEWPORTS.mobile, { width: 375, height: 812 })
})

test('outputPath nests captures by viewport then page name', () => {
  assert.equal(
    outputPath('e2e/screenshots', 'desktop', 'login'),
    'e2e/screenshots/desktop/login.png',
  )
  assert.equal(
    outputPath('e2e/screenshots', 'mobile', 'cv-studio'),
    'e2e/screenshots/mobile/cv-studio.png',
  )
})

test('outputPath rejects a missing viewport or page name', () => {
  assert.throws(() => outputPath('base', '', 'login'))
  assert.throws(() => outputPath('base', 'desktop', ''))
})

test('buildSummary buckets captured, failed, and skipped results', () => {
  const summary = buildSummary([
    { name: 'a', viewport: 'desktop', status: 'captured', path: 'e2e/screenshots/desktop/a.png' },
    { name: 'b', viewport: 'desktop', status: 'failed', error: 'boom' },
    { name: 'c', viewport: 'mobile', status: 'skipped', error: 'no admin available' },
  ])
  assert.equal(summary.total, 3)
  assert.equal(summary.capturedCount, 1)
  assert.equal(summary.failedCount, 1)
  assert.equal(summary.skippedCount, 1)
  assert.equal(summary.captured[0].name, 'a')
  assert.equal(summary.failed[0].error, 'boom')
  assert.equal(summary.skipped[0].name, 'c')
  assert.ok(summary.generatedAt)
})

test('buildSummary tolerates an empty result set without failing the run', () => {
  const summary = buildSummary([])
  assert.equal(summary.total, 0)
  assert.equal(summary.capturedCount, 0)
})
