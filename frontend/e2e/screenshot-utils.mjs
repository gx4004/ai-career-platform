/** Pure helpers for the screenshots harness (frontend/e2e/screenshots.spec.ts).
 *
 * Kept dependency-free and framework-agnostic (plain .mjs) so the manifest
 * and the output/summary shaping can be unit-tested with `node --test`
 * (see tests/screenshot-utils.test.mjs) without booting Playwright, a
 * browser, or the backend.
 */

/** Viewports the harness captures every page at. */
export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 375, height: 812 },
}

/**
 * Fixed-route pages the harness visits directly. Two additional pages —
 * `resume-result` and `campaign-detail` — are captured by screenshots.spec.ts
 * after seeding resolves their dynamic URLs (a result id, a campaign/workspace
 * id), so they have no fixed `path` and are not listed here.
 *
 * `auth` says which browser context a page is captured from:
 *  - "guest"  — an unauthenticated context (the harness never signs in here)
 *  - "user"   — the seeded test user's authenticated context
 *  - "admin"  — the same user after a best-effort DB promotion to admin;
 *               skipped (not failed) when that promotion isn't available
 */
export const STATIC_PAGES = [
  { name: 'landing', path: '/', auth: 'guest' },
  { name: 'login', path: '/login', auth: 'guest' },
  { name: 'dashboard', path: '/dashboard', auth: 'user' },
  { name: 'resume-input', path: '/resume', auth: 'user' },
  { name: 'job-match-input', path: '/job-match', auth: 'user' },
  { name: 'career-input', path: '/career', auth: 'user' },
  { name: 'cover-letter-input', path: '/cover-letter', auth: 'user' },
  { name: 'interview-input', path: '/interview', auth: 'user' },
  { name: 'portfolio-input', path: '/portfolio', auth: 'user' },
  { name: 'history', path: '/history', auth: 'user' },
  { name: 'settings', path: '/settings', auth: 'user' },
  { name: 'account', path: '/account', auth: 'user' },
  { name: 'cv-studio', path: '/cv-studio', auth: 'user' },
  { name: 'profile', path: '/profile', auth: 'user' },
  { name: 'development-plan', path: '/development-plan', auth: 'user' },
  { name: 'discovery', path: '/discovery', auth: 'user' },
  { name: 'queue', path: '/queue', auth: 'user' },
  { name: 'admin', path: '/admin', auth: 'admin' },
]

/** Where a (viewport, page) capture is written, relative to the harness's output root. */
export function outputPath(baseDir, viewport, name) {
  if (!baseDir) throw new Error('outputPath requires baseDir')
  if (!viewport) throw new Error('outputPath requires viewport')
  if (!name) throw new Error('outputPath requires name')
  return `${baseDir}/${viewport}/${name}.png`
}

/**
 * Shapes the run's per-page results into the summary.json the harness writes.
 * Never throws on an empty or all-failed result set — the harness must be
 * able to record "nothing captured" as data, not as a crash.
 */
export function buildSummary(results) {
  const captured = results.filter((r) => r.status === 'captured')
  const failed = results.filter((r) => r.status === 'failed')
  const skipped = results.filter((r) => r.status === 'skipped')

  return {
    generatedAt: new Date().toISOString(),
    total: results.length,
    capturedCount: captured.length,
    failedCount: failed.length,
    skippedCount: skipped.length,
    captured: captured.map((r) => ({ name: r.name, viewport: r.viewport, path: r.path })),
    failed: failed.map((r) => ({ name: r.name, viewport: r.viewport, error: r.error })),
    skipped: skipped.map((r) => ({ name: r.name, viewport: r.viewport, error: r.error })),
  }
}
