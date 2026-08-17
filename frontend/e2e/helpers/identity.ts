/** Account addresses that stay unique across parallel workers and repeats.
 *
 * Every spec used to build its own address from `Date.now()` alone. Playwright
 * runs two workers in CI mode, so two tests starting in the same millisecond
 * produced the *identical* address: the first registration won and the second
 * got a 409 "Email already registered", failing far away from the cause — in
 * the shared `register()` helper, waiting for a signed-in heading that never
 * appeared. Repeat runs made it routine rather than rare.
 *
 * The worker index separates concurrent workers, and the counter plus random
 * suffix separates repeats within one worker, so no two calls can collide.
 */
let sequence = 0

export function uniqueEmail(prefix: string): string {
  const worker = process.env.TEST_WORKER_INDEX ?? '0'
  const suffix = Math.random().toString(36).slice(2, 8)
  sequence += 1
  return `${prefix}-${Date.now()}-w${worker}-${sequence}${suffix}@example.com`
}
